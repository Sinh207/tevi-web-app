import { env } from '@shared/config/env'
import { ApiError } from '@shared/lib/api/errors'
import { ANON_SCOPE, invalidateETagCache } from '@shared/lib/api/interceptors/etag'
import { createApiModel } from '@shared/lib/api/model'
import { type PageCursor, paramsFromNextUrl } from '@shared/lib/api/page-cursor'
import { z } from 'zod'

/**
 * Appealing a space's NSFW status — four calls, none of which exists in legacy **web**.
 *
 * The flow ships in the iOS and Android apps and nowhere else, so unlike almost everything in this
 * repo there is no reference implementation to read: the paths and the sequence below were given by
 * the team, and the *payload shapes* are inferred. Everything that is a guess is marked, and the
 * open questions are **B96** in [`docs/BACKEND_QUESTIONS.md`](../../../../docs/BACKEND_QUESTIONS.md).
 *
 * ⚠ **On `core`, at two different versions.** The three appeal calls are `v3` under
 * `channel/my-channel/`; deleting a post is `v1` under `posts/`. That is not a typo to tidy up —
 * post deletion belongs to a different service surface and keeps its own version.
 */
const api = createApiModel({ apiBase: `${env.NEXT_PUBLIC_W_API_DOMAIN}/core` })

/**
 * One page of flagged posts, and the page size the flow was specified with.
 *
 * The list is a **work queue** rather than a feed: every row on it has to be deleted before the
 * appeal can be filed, so there is no paging UI. Deleting a row invalidates the query and the next
 * ten arrive in its place — which is what lets an empty page mean an empty queue. See
 * `useNsfwAppeal`.
 */
const POSTS_PAGE_SIZE = 10

/**
 * How long a `latest/` answer counts as current.
 *
 * Not zero, and not a cache: the CTA that opens the screen **prefetches this same query** so the
 * button can hold the wait, and with `staleTime: 0` the screen's own `useQuery` would treat that
 * fresh answer as stale and immediately ask again — two requests for one press, the second of which
 * can only say what the first did. Ten seconds is long enough to cover the press and short enough
 * that an appeal filed on the phone a minute ago still shows up on the next open.
 */
export const LATEST_STALE_MS = 10_000

export const nsfwAppealKeys = {
    /**
     * Account-scoped, like every `my-channel` key in this app: two accounts on one device have
     * different flagged posts and different appeals, and an unscoped key would show one of them the
     * other's queue for as long as the cache lived.
     */
    latest: (accountId: string | null | undefined) =>
        ['nsfw-appeal', 'latest', accountId ?? 'anon'] as const,
    /**
     * Keyed by the **page**, because the screen shows one page at a time and advancing is a
     * different query rather than a refetch of this one — a cleared page and the page behind it must
     * not share a cache entry, or the splice that cleared the first would be undone by the second.
     */
    posts: (accountId: string | null | undefined, cursor?: PageCursor | null) =>
        ['nsfw-appeal', 'posts', accountId ?? 'anon', cursor ?? null] as const,
}

/** ISO out, seconds or milliseconds in — the same normalisation `features/channel` applies. */
const nullableTimestamp = z
    .unknown()
    .transform(value => {
        const raw =
            typeof value === 'number'
                ? value
                : typeof value === 'string' && /^\d+$/.test(value.trim())
                  ? Number(value.trim())
                  : null
        if (raw !== null) {
            if (!Number.isFinite(raw) || raw <= 0) return null
            const date = new Date(raw < 1e11 ? raw * 1000 : raw)
            return Number.isNaN(date.getTime()) ? null : date.toISOString()
        }
        if (typeof value !== 'string') return null
        const trimmed = value.trim()
        if (trimmed === '') return null
        return Number.isNaN(new Date(trimmed).getTime()) ? null : trimmed
    })
    .catch(null)

const nullableText = z
    .unknown()
    .transform(v => (typeof v === 'string' && v.trim() ? v.trim() : null))
    .catch(null)

const count = z.coerce.number().int().nonnegative().catch(0)

/** `{ h, w, uri }` — the post payload's own picture shape, used by `images[]` and `cover_image`. */
const pictureSchema = z.looseObject({ uri: nullableText })

/**
 * Who the post is for, which is the leading mark on a queue row.
 *
 * Three states and they are not a rank: **paid** is any post carrying a `price`, **restricted** is
 * anything whose `viewer` is not `EVERYONE` (`STARGAZERS`, a membership package), and **public** is
 * the rest. Read in that order — a paid post is *also* not public, and the design draws the money
 * mark for it, so price wins.
 */
export type NsfwPostAccess = 'paid' | 'restricted' | 'public'

/**
 * A flagged post, reduced to the row the appeal screen draws — and every field below is now **read
 * off a captured payload** rather than guessed. B96 records what that payload settled and the one
 * thing still open (a video's duration).
 *
 * `id` is required and a row without one is dropped: it is the DELETE path, so such a row would be a
 * Delete button guaranteed to 404, and one row fewer is better than one button that lies.
 */
const nsfwPostSchema = z
    .looseObject({
        id: z.union([z.string(), z.number()]),
        /** The caption. `text` — *not* `content`, which the payload does not have. */
        text: nullableText,
        created_at: nullableTimestamp,
        images: z.array(pictureSchema).catch([]),
        cover_image: pictureSchema.nullish().catch(null),
        video: z.unknown().nullish().catch(null),
        viewer: nullableText,
        price: z.unknown().nullish().catch(null),
        /** Tevi's reaction *is* a star, which is why the design draws a star glyph beside it. */
        reaction_count: count,
        reply_count: count,
    })
    .transform(row => {
        const access: NsfwPostAccess =
            row.price !== null && row.price !== undefined && row.price !== ''
                ? 'paid'
                : row.viewer && row.viewer !== 'EVERYONE'
                  ? 'restricted'
                  : 'public'
        return {
            id: String(row.id).trim(),
            caption: row.text,
            createdAt: row.created_at,
            /*
             * `cover_image` first: for a sensitive post the backend hands back a **blurred**
             * derivative there (`imge.tevi.app/unsafe/filters:blur(80)/…`) while `images[0]` is the
             * original. On a screen listing content that was flagged as explicit, the blurred one is
             * the right thumbnail — and it is also the one the reader has already seen in their own
             * feed.
             */
            thumbnail: row.cover_image?.uri ?? row.images[0]?.uri ?? null,
            /** Drawn as the badge over the thumbnail — the design shows `12` for a 12-image post. */
            imageCount: row.images.length,
            isVideo: Boolean(row.video),
            access,
            starCount: row.reaction_count,
            replyCount: row.reply_count,
        }
    })
    .refine(row => row.id !== '')

export type NsfwPost = z.infer<typeof nsfwPostSchema>

export interface NsfwPostQueue {
    posts: NsfwPost[]
    /**
     * The params for the page after this one, or `null` when this is the last.
     *
     * `next` arrives as an **absolute URL** the client must not follow — see
     * `shared/lib/api/page-cursor.ts` for the two reasons — so only its query survives. It matters
     * more here than on an ordinary list: this is the signal that decides whether an emptied page
     * means an empty *queue*, and a queue that is not empty must not offer an appeal the backend
     * will refuse.
     */
    nextCursor: PageCursor | null
}

/**
 * Posts this session has deleted, and why the client has to remember them at all.
 *
 * **The backend caches the queue.** A `DELETE v1/posts/{id}/` succeeds and a subsequent
 * `nsfw-posts/` still lists the row — not a 304 this time (that is
 * `forgetFlaggedPostsCache`'s problem, and it is fixed), but a genuinely stale body. So the appeal
 * screen cannot treat a fresh read as the truth about what is left: it would resurrect rows the
 * creator has already deleted, and the Submit button would never enable.
 *
 * A deletion is **monotonic** — a post that is gone does not come back — which is what makes
 * filtering safe: this can only ever hide rows the server should not have sent, never rows the
 * creator still has to act on. Module-level and session-scoped on purpose: ids are uuids, so there
 * is nothing to key it by, and a reload is exactly when it should be forgotten (by then the
 * backend's own cache has moved on, and if it has not, the creator sees a row they can delete
 * again).
 *
 * Filtering happens **here**, at the parse, so every read is covered — the first page, a page the
 * cursor advanced to, and a re-read after the dialog is closed and reopened.
 */
const deletedPostIds = new Set<string>()

export function rememberDeletedPost(id: string) {
    deletedPostIds.add(id)
}

/**
 * Forget the queue's cached validator — **the write this flow makes is a `DELETE`, and the read it
 * has to re-take is a conditional GET.**
 *
 * ## The bug this exists for
 *
 * `apiClient` sends `If-None-Match` on every GET and replays the cached body on a **304**. So after
 * deleting a flagged post, the refetch that is supposed to prove the queue got shorter was answered
 * `304 Not Modified` and handed back the *pre-delete* list — the deleted row still on screen, and
 * the Submit button still disabled, forever. Nothing failed: no error, no retry, a green 304 in the
 * network panel and a screen that quietly cannot be completed.
 *
 * That the server answers 304 at all after the row is gone is its own question (**B96**) — an ETag
 * that does not move when the collection does is a backend bug. But the client must not depend on
 * the answer: the whole appeal turns on this one refetch being true.
 *
 * Keyless on purpose, so it drops **every** query variant of the path — the appeal only ever asks
 * for `?limit=10`, but a write does not respect the filters a client happened to read through, and
 * that is the rule `invalidateETagCache` is written to.
 *
 * Aimed at the **event**, not the endpoint, exactly as `forgetMyChannelCache` is: an ordinary read
 * of this list stays a conditional GET, because paying a full body on every open to be right for the
 * few seconds after a delete is the wrong trade.
 */
export function forgetFlaggedPostsCache(accountId: string | null) {
    return invalidateETagCache(
        accountId ?? ANON_SCOPE,
        `${api.apiBase}/v3/channel/my-channel/nsfw-posts/`,
    )
}

export const nsfwAppealApi = {
    /**
     * The account's most recent appeal, or `null` if it has never filed one.
     *
     * ⚠ **A 404 is the normal answer**, exactly as `GET v1/appeal/` is documented to behave for the
     * suspension appeal (B96). So it is caught and turned into `null` rather than left to reject:
     * an error state here would tell somebody their appeal could not be looked up when the truth is
     * that they have not made one. Any *other* status still throws — a 500 must not read as "no
     * appeal on file", which would silently offer to file a second one.
     */
    async getLatestAppeal({ signal }: { signal?: AbortSignal } = {}): Promise<unknown | null> {
        try {
            const body = await api.get<unknown>(
                'v3/channel/my-channel/nsfw-appeal/latest/',
                undefined,
                { signal },
            )
            // "200 **and** has data" is the condition — an empty body is not a pending appeal.
            if (body === null || body === undefined) return null
            if (typeof body === 'object' && Object.keys(body as object).length === 0) return null
            return body
        } catch (error) {
            if (error instanceof ApiError && error.status === 404) return null
            throw error
        }
    },

    /**
     * One page of the posts that earned the space its label.
     *
     * `cursor` is the previous page's `nextCursor`; without one it asks for the first page. Rows
     * this session has already deleted are dropped — see `deletedPostIds` for why a read cannot be
     * trusted on its own.
     */
    async getFlaggedPosts({
        cursor,
        signal,
    }: {
        cursor?: PageCursor | null
        signal?: AbortSignal
    } = {}): Promise<NsfwPostQueue> {
        const body = await api.get<{ results?: unknown; next?: unknown }>(
            'v3/channel/my-channel/nsfw-posts/',
            /*
             * The cursor is `Record<string, string[]>`, so its keys must repeat rather than be
             * bracketed — `apiClient`'s `paramsSerializer` is what does that. Without it DRF
             * ignores the cursor and answers **page one again**: the screen clears a page,
             * advances, and is handed the same page back.
             */
            cursor ?? { limit: POSTS_PAGE_SIZE },
            { signal },
        )
        const rows = Array.isArray(body?.results) ? body.results : []
        return {
            /*
             * A row that will not parse is dropped, the list is not — the rule every other list in
             * this app follows. One odd post must not turn into "you cannot appeal".
             */
            posts: rows
                .map(row => nsfwPostSchema.safeParse(row))
                .filter(result => result.success)
                .map(result => result.data)
                .filter(post => !deletedPostIds.has(post.id)),
            nextCursor: paramsFromNextUrl(typeof body?.next === 'string' ? body.next : null),
        }
    },

    /** Delete one flagged post. Idempotent by nature, so a retry is harmless — but see below. */
    deletePost(id: string) {
        return api.del(`v1/posts/${encodeURIComponent(id)}/`)
    },

    /**
     * File the appeal.
     *
     * ⚠ **Not retried.** `apiClient` replays a POST only with `{ retry: true }`, and nothing says
     * this endpoint deduplicates — a 502 arriving after the appeal landed would file a second one
     * against the same space, which is the sort of thing a moderation queue counts.
     */
    submitAppeal() {
        return api.post('v3/channel/my-channel/nsfw-appeal/', {})
    },
}
