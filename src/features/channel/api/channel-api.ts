import { env } from '@shared/config/env'
import { ApiError } from '@shared/lib/api/errors'
import { createApiModel } from '@shared/lib/api/model'
import { BLOCKED_FIRST_PAGE, type BlockedAccountsPage } from '../lib/blocked-accounts-page'
import type { ThreadCursor } from '../lib/next-page-param'
import {
    type Channel,
    type ChannelPrivacy,
    type ChannelThread,
    normalizeBlockedAccounts,
    normalizeCategoryNames,
    normalizeChannel,
    normalizeSocialPlatforms,
    type Paginated,
    parseAckPrivacy,
    type SocialPlatform,
} from './types'

/** Channel service: `${W_API}/core`. */
const api = createApiModel({ apiBase: `${env.NEXT_PUBLIC_W_API_DOMAIN}/core` })

/**
 * Query keys for the channel feature.
 *
 * **Every key carries the account id**, including `detail`, which looks like it needs only a
 * slug. It doesn't: the payload is personalised — `is_followed`, `blocking_channel`,
 * `notification_settings`, `income_usd` — so an un-scoped key hands account B whatever account
 * A saw the moment someone switches accounts in the switcher. Same reasoning as
 * `authKeys.me`; making it uniform across all four keys is simpler than remembering which
 * payloads are personal.
 *
 * `detail` is keyed by the **canonical** slug only. The page redirects any other spelling
 * before it renders, so `/@Ada` and `/@ada` can never produce two entries.
 */
export const channelKeys = {
    all: ['channel'] as const,
    detail: (slug: string, accountId: string | null) =>
        ['channel', 'detail', slug, accountId ?? 'anon'] as const,
    myChannel: (accountId: string | null) =>
        ['channel', 'my-channel', accountId ?? 'anon'] as const,
    stats: (slug: string, accountId: string | null) =>
        ['channel', 'stats', slug, accountId ?? 'anon'] as const,
    threads: (slug: string, kind: ThreadKind, accountId: string | null) =>
        ['channel', 'threads', slug, kind, accountId ?? 'anon'] as const,
    activity: (slug: string, accountId: string | null) =>
        ['channel', 'activity', slug, accountId ?? 'anon'] as const,
    /**
     * The signed-in account's blocked list. Account-scoped for the same reason as the
     * rest — it is a *personal* list, and an un-scoped key would hand account B account
     * A's blocks the moment someone uses the switcher.
     */
    blocks: (accountId: string | null) => ['channel', 'blocks', accountId ?? 'anon'] as const,
    /**
     * The two option lists the edit-profile form fills its pickers from.
     *
     * The **only** keys in this feature with no account in them, and deliberately so: neither
     * answer is personal — the category list and the supported social platforms are the same for
     * everybody — so scoping them per account would refetch both on every switch to receive an
     * identical body. The rule the rest of the file follows ("personalised payload ⇒ account in
     * the key") is what says these two are different, not an exception to it.
     */
    categories: () => ['channel', 'categories'] as const,
    socialPlatforms: () => ['channel', 'social-platforms'] as const,
}

/**
 * The fields `PATCH my-channel/` accepts.
 *
 * Every one optional, because the form sends **only what changed** — see `buildChannelPatch`.
 * `images` is all-or-nothing on the wire: the endpoint replaces the object it is given, so a
 * patch that carries a new cover must carry the existing thumb alongside it or the avatar is
 * cleared. That is the caller's job and the reason `ChannelImages` is spelled out here.
 */
export interface ChannelPatch {
    name?: string
    slug?: string
    description?: string
    categories?: string[]
    social_links?: { platform: string; title: string | null; url: string }[]
    show_income?: boolean
    images?: {
        thumb: string | null
        cover: string | null
        avatar_video: unknown
    }
}

export type ThreadKind = 'posts' | 'media'

/**
 * First-page params per tab, from legacy.
 *
 * `21` for media is not arbitrary — it is seven rows of a three-wide grid, so the last row is
 * never a ragged one or two tiles. `pinned: 0` excludes pinned posts, which legacy fetches as
 * a separate prepended request; that belongs with `features/post`, since a placeholder card
 * cannot express pinning.
 */
const FIRST_PAGE: Record<ThreadKind, Record<string, unknown>> = {
    posts: { limit: 20, pinned: 0 },
    media: { limit: 21, pinned: 0, media_type: ['image', 'video'] },
}

/**
 * Axios 1.x serialises `{ media_type: ['image','video'] }` as `media_type[]=image&…`, and DRF
 * wants the bare key repeated. `indexes: null` is the flag that produces that.
 *
 * Getting this wrong is a **silent** failure, which is why it is a named constant with a test:
 * the server ignores the bracketed key, returns unfiltered results, and the media tab fills
 * with posts. It looks like it works. See B12.
 */
const REPEAT_ARRAY_PARAMS = { paramsSerializer: { indexes: null } } as const

/** The slug comes straight off the URL, so it is encoded at every use (DoD §8). */
const channelPath = (slug: string, suffix = '') =>
    `v3/channel/channels/${encodeURIComponent(slug)}/${suffix}`

export const channelApi = {
    /** A channel by slug, as seen by whoever the bearer belongs to. */
    async getChannel(slug: string, accountId?: string | null): Promise<Channel | null> {
        const body = await api.get<unknown>(
            channelPath(slug),
            undefined,
            accountId ? { accountId } : undefined,
        )
        return normalizeChannel(body)
    },

    /**
     * The signed-in account's own channel, or `null` when it has none.
     *
     * **A 404 is an answer, not a failure**, and swallowing it *here* rather than at the hook
     * is what makes the contract `Channel | null` for every consumer. The consequences are all
     * load-bearing: the query resolves as `success`, so it does not trip `meta.showErrorToast`,
     * does not enter an error state, and `isPending` goes false — which is precisely what
     * ownership resolution and `/my-space` need in order to tell "still loading" apart from
     * "this account has no channel yet". Handling it at the hook with `throwOnError: false`
     * leaves `data === undefined` for both cases and collapses that distinction.
     *
     * `auto_create=0` matters: without it the endpoint creates a channel as a side effect of
     * being asked about one, so merely visiting a page would provision a space.
     */
    async getMyChannel(accountId?: string | null): Promise<Channel | null> {
        try {
            const body = await api.get<unknown>(
                'v3/channel/my-channel/',
                { auto_create: 0 },
                accountId ? { accountId } : undefined,
            )
            return normalizeChannel(body)
        } catch (error) {
            if (error instanceof ApiError && error.status === 404) return null
            throw error
        }
    },

    /**
     * One page of the channel's posts or media.
     *
     * The owner reads their own list through `my-channel/threads/` rather than
     * `channels/{slug}/threads/` — legacy does the same, and the two are not interchangeable:
     * the owner's endpoint returns drafts and paywalled posts that the public one filters out.
     *
     * `cursor` **replaces** the first-page params rather than merging with them. Legacy passes
     * `limit` alongside an already-complete cursor query, which duplicates whatever the cursor
     * carried; here it is one or the other.
     */
    getThreads({
        slug,
        isOwner,
        kind,
        cursor,
        accountId,
        signal,
    }: {
        slug: string
        isOwner: boolean
        kind: ThreadKind
        cursor?: ThreadCursor | null
        accountId?: string | null
        signal?: AbortSignal
    }) {
        const path = isOwner ? 'v3/channel/my-channel/threads/' : channelPath(slug, 'threads/')
        return api.get<Paginated<ChannelThread>>(path, cursor ?? FIRST_PAGE[kind], {
            signal,
            ...(accountId ? { accountId } : {}),
            ...REPEAT_ARRAY_PARAMS,
        })
    },

    /**
     * One page of the owner's activity feed — new memberships and donations.
     *
     * **Page-number pagination, not the cursor the thread lists use.** Legacy passes `page` /
     * `page_size` here and reads `count` to decide whether to keep offering "show more"; the
     * `next`-URL cursor is only on the thread endpoints. Two pagination styles in one feature is
     * legacy's shape, not a choice — see B22.
     *
     * `page_size` defaults to legacy's 4: this is a preview block on an information tab, not a feed.
     */
    getActivityFeed({
        slug,
        page = 1,
        pageSize = 4,
        accountId,
        signal,
    }: {
        slug: string
        page?: number
        pageSize?: number
        accountId?: string | null
        signal?: AbortSignal
    }) {
        return api.get<Paginated<unknown>>(
            channelPath(slug, 'activity-feed/'),
            { page, page_size: pageSize },
            { signal, ...(accountId ? { accountId } : {}) },
        )
    },

    /**
     * Follow, or request to follow a protected space.
     *
     * ⚠ **The same endpoint is also mute/unmute.** `{}` follows; `{ notification }` writes the
     * notification preference on an existing follow. There is no separate mute route — a future
     * reader will assume there is and "fix" this, so the two callers are named for what they do
     * and both point here. See B15 for whether a bare `{}` is idempotent.
     */
    follow(slug: string, notification?: boolean) {
        const body = notification === undefined ? {} : { notification }
        return api.post(channelPath(slug, 'follow/'), body)
    },

    unfollow(slug: string) {
        return api.post(channelPath(slug, 'unfollow/'), {})
    },

    /**
     * Set the owner's own space visibility — `/settings/space-visibility`.
     *
     * `POST`, not `PATCH`, and on its own sub-route rather than as a field on
     * `my-channel/`: legacy does the same (`models/channel.js`), and the separate route is
     * the reason this is not folded into a general channel-update call — the backend rate
     * limits *this* transition (once every 24 hours) and nothing else about the channel.
     *
     * **Never carries a slug.** The endpoint acts on whichever channel the bearer owns, so
     * the account is the only thing that selects the target — hence `accountId` is passed
     * through to the client rather than being read from the active session when the request
     * is built. An account switch mid-flight must not redirect the write.
     *
     * Returns the acknowledged visibility, or `null` when the body did not carry one that
     * this client recognises — see `parseAckPrivacy` for why that is not defaulted.
     */
    async updatePrivacy(
        privacy: ChannelPrivacy,
        accountId?: string | null,
    ): Promise<ChannelPrivacy | null> {
        const body = await api.post<unknown>(
            'v3/channel/my-channel/privacy/',
            { privacy },
            accountId ? { accountId } : undefined,
        )
        return parseAckPrivacy(body)
    },

    /**
     * Write the signed-in account's own channel — the edit-profile form's one request.
     *
     * `PATCH`, and the body is a **diff**: legacy assembles `data` field by field and only
     * includes what differs from the loaded channel. That is not merely economical. `slug` is
     * rate-limited to one change a week and `images` re-runs moderation on whatever it is given,
     * so a "send everything" body would spend both on a save where the person only fixed a typo
     * in their bio.
     *
     * Like `updatePrivacy`, it **never carries a slug**: the endpoint acts on whichever channel
     * the bearer owns, so `accountId` is threaded through rather than read from the active
     * session as the request is built — an account switch mid-flight must not redirect the write.
     *
     * Returns the updated channel, or `null` when the body was not one this client can parse. The
     * caller then re-reads instead of folding a shape it does not understand over the cache; the
     * mirror of the guard `useUpdateMe` puts on `/me`.
     */
    async updateMyChannel(patch: ChannelPatch, accountId?: string | null): Promise<Channel | null> {
        const body = await api.patch<unknown>(
            'v3/channel/my-channel/',
            patch,
            accountId ? { accountId } : undefined,
        )
        return normalizeChannel(body)
    },

    /**
     * Ask whether a username is free — `POST v3/channel/check-slug/`.
     *
     * **A rejection is a 4xx, not a `{ available: false }` body**, which is why this resolves to
     * `true` and lets the error through: there is no third state to model, and the message the
     * failure carries ("already taken", "too short", "reserved") is the only thing worth showing.
     * The caller catches and reads it. Same contract legacy relies on.
     */
    async checkSlug(slug: string, signal?: AbortSignal): Promise<true> {
        await api.post('v3/channel/check-slug/', { slug }, { signal })
        return true
    },

    /**
     * Slugs the backend thinks are free, for a name that is not — `GET v3/channel/suggest-slug/?q=`.
     *
     * Legacy calls this from **two** places: after a display name validates (seeding suggestions
     * before the user has typed a link at all) and after a slug is rejected. Both are the same
     * question, so it is one method.
     *
     * Failures resolve to `[]` rather than throwing. Suggestions are an assist — a creator can type
     * their own link — so a dead suggest endpoint must not block the form that is otherwise fine.
     */
    async suggestSlugs(query: string, signal?: AbortSignal): Promise<string[]> {
        if (!query.trim()) return []
        try {
            const body = await api.get<Partial<Paginated<unknown>>>(
                'v3/channel/suggest-slug/',
                { q: query },
                { signal },
            )
            return (Array.isArray(body?.results) ? body.results : [])
                .map(row => (typeof row === 'string' ? row : (row as { slug?: unknown })?.slug))
                .filter((slug): slug is string => typeof slug === 'string' && slug.length > 0)
        } catch {
            return []
        }
    },

    /**
     * Creates the account's space — `POST v3/channel/my-channel/`.
     *
     * Answers **201** with the new channel. Anything else throws, and the body's `errors[]` is what
     * the form shows: the backend returns per-field codes, and `sensitive` is the one that has to
     * land on the avatar rather than in a toast — it means the uploaded image was rejected by
     * moderation, and a general error message beside an untouched picture is a dead end.
     */
    async createMyChannel(
        input: { name: string; slug: string; images?: { thumb: string } },
        accountId?: string | null,
    ): Promise<Channel | null> {
        const body = await api.post<unknown>(
            'v3/channel/my-channel/',
            input,
            accountId ? { accountId } : undefined,
        )
        return normalizeChannel(body)
    },

    /**
     * Every category a space may be filed under.
     *
     * `page_size: 100` is legacy's, and it is also the whole list — the form has no pagination
     * and a category picker that silently stops at page one would be worse than one that is
     * visibly long. If the taxonomy ever passes 100 this is the line that has to grow a cursor.
     */
    async getCategories(signal?: AbortSignal): Promise<string[]> {
        const body = await api.get<Partial<Paginated<unknown>>>(
            'v3/channel/categories/',
            { page: 1, page_size: 100 },
            { signal },
        )
        return normalizeCategoryNames(body?.results)
    },

    /** The platforms a social link may point at. Server-driven — see `socialPlatformSchema`. */
    async getSocialPlatforms(signal?: AbortSignal): Promise<SocialPlatform[]> {
        const body = await api.get<Partial<Paginated<unknown>>>(
            'v3/channel/my-channel/social-links/supported-platforms/',
            { page: 1, page_size: 100 },
            { signal },
        )
        return normalizeSocialPlatforms(body?.results)
    },

    /** Blocks are keyed by **user** id (`channel.owner_id`), not channel id. */
    blockUser(userId: string) {
        return api.post('v3/channel/my-channel/blocks/', { user_id: userId })
    },

    /**
     * ⚠ **The path segment is not the same identifier `blockUser` posts**, or at least the two
     * shipped clients disagree about whether it is — see B23.
     *
     * The channel page passes `channel.owner_id` (a user id); legacy's blocked-accounts screen,
     * the only place in either app that lists blocks, passes the **block record's** id. Both
     * end up here, so the parameter is named for what the endpoint sees rather than for what
     * either caller thinks it is sending, and neither call site is "fixed" to match the other
     * on a guess. Whichever is wrong is wrong at the call site, not here.
     */
    unblockUser(blockOrUserId: string) {
        return api.del(`v3/channel/my-channel/blocks/${encodeURIComponent(blockOrUserId)}/`)
    },

    /**
     * One page of the accounts this bearer has blocked.
     *
     * `accountId` is threaded through rather than read from the active session when the
     * request is built, for the reason `updatePrivacy` gives: this is a personal list, and an
     * account switch mid-flight must not have page two answered as somebody else.
     *
     * The results are **normalised here, not at the hook** — so every consumer, including the
     * cache-surgery helpers, sees `BlockedAccount[]` and never a raw row. `count` is coerced
     * because it is rendered ("N blocked accounts") and a missing envelope field would
     * otherwise print `NaN`; `next` is passed through untouched, since
     * `nextBlockedCursor` needs to tell absent from explicitly null.
     */
    async getBlockedAccounts({
        cursor,
        accountId,
        signal,
    }: {
        cursor?: ThreadCursor | null
        accountId?: string | null
        signal?: AbortSignal
    }): Promise<BlockedAccountsPage> {
        const body = await api.get<Partial<Paginated<unknown>>>(
            'v3/channel/my-channel/blocks/',
            cursor ?? BLOCKED_FIRST_PAGE,
            { signal, ...(accountId ? { accountId } : {}) },
        )
        const results = normalizeBlockedAccounts(body?.results)
        const count = Number(body?.count)
        return {
            results,
            // `results.length` and not `0` as the fallback: a payload with rows but no
            // `count` should say how many it has, not claim to be empty above a full list.
            count: Number.isFinite(count) && count >= 0 ? count : results.length,
            next: body?.next,
        }
    },
}

export { FIRST_PAGE as CHANNEL_FIRST_PAGE }
