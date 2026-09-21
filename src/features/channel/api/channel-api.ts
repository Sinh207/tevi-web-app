import { env } from '@shared/config/env'
import { ApiError } from '@shared/lib/api/errors'
import { ANON_SCOPE, CACHE_TTL, invalidateETagCache } from '@shared/lib/api/interceptors/etag'
import { createApiModel } from '@shared/lib/api/model'
import type { PageCursor } from '@shared/lib/api/page-cursor'
import { BLOCKED_FIRST_PAGE, type BlockedAccountsPage } from '../lib/blocked-accounts-page'
import {
    FOLLOW_REQUESTS_COUNT_PAGE,
    FOLLOW_REQUESTS_FIRST_PAGE,
    type FollowRequestsPage,
} from '../lib/follow-requests-page'
import {
    FOLLOWED_LIVES_LIMIT,
    FOLLOWING_FIRST_PAGE,
    type FollowedChannelsPage,
} from '../lib/following-page'
import {
    type Channel,
    type ChannelPrivacy,
    type ChannelThread,
    type FollowedLive,
    type FollowedOrdering,
    normalizeBlockedAccounts,
    normalizeCategoryNames,
    normalizeChannel,
    normalizeFollowedChannels,
    normalizeFollowedLives,
    normalizeFollowRequests,
    normalizeSocialPlatforms,
    type Paginated,
    parseAckPrivacy,
    type SocialPlatform,
} from './types'

/** Channel service: `${W_API}/core`. */
const api = createApiModel({ apiBase: `${env.NEXT_PUBLIC_W_API_DOMAIN}/core` })

/**
 * Forget the cached `v3/channel/my-channel/` body for one account — **on the `premium_info` frame**,
 * and only then.
 *
 * The trap `forgetPremiumInfoCache` and `forgetMyMembershipsCache` were written for (**B72**), on a
 * third endpoint. `invalidateQueries` alone looks as though it should be enough and is not: the
 * refetch carries the `If-None-Match` this client still holds, the service answers `304` because
 * *its* validator has not moved, and `apiClient` replays the cached body — so an account that has
 * just bought Premium is re-told it has none.
 *
 * That matters more here than for the expiry date, because `is_premium` from this body is what the
 * **whole app** reads: the drawer's gold profile card, the avatar's ring and crown, and `/premium`'s
 * own hero branch and plan grid. A stale `false` leaves a paying reader looking at the offer.
 *
 * Aimed at the **event**, not the endpoint — the same trade the premium helper states. Every other
 * read of `my-channel` is an ordinary conditional GET and stays one; making the endpoint
 * unconditional would pay a full body on every visit to be right for a few seconds after a purchase.
 */
export function forgetMyChannelCache(accountId: string | null) {
    return invalidateETagCache(accountId ?? ANON_SCOPE, `${api.apiBase}/v3/channel/my-channel/`)
}

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
     *
     * `q` is **in the key**, so a searched list is its own cache entry rather than
     * overwriting the unfiltered one — which is what makes clearing the field instant
     * instead of a request. The empty term is the unfiltered list's key, so it is the
     * default and every existing call site keeps meaning what it meant.
     */
    blocks: (accountId: string | null, q = '') =>
        ['channel', 'blocks', accountId ?? 'anon', q] as const,
    /**
     * Every search's list for one account — the prefix `blocks` extends.
     *
     * Invalidation scope, and it exists because a row removed from the *searched* list is
     * still sitting in the unfiltered one: they are separate entries now, and a 60s
     * `staleTime` is long enough for a reader to clear the field and be shown the account
     * they just unblocked, with an Unblock button that 404s.
     */
    blocksAll: (accountId: string | null) => ['channel', 'blocks', accountId ?? 'anon'] as const,
    /**
     * The pending follow requests for the signed-in account's own space. Account-scoped like
     * the rest, and for the sharper version of the same reason: it is a list of people asking
     * to see a *protected* space, so handing account B account A's copy after a switch would
     * show one account's private list to another.
     */
    followRequests: (accountId: string | null) =>
        ['channel', 'follow-requests', accountId ?? 'anon'] as const,
    /**
     * How many are pending — the drawer's badge, and **its own key on purpose.**
     *
     * It is not the list's key with a different page size: the drawer asks for one row and the
     * screen asks for twenty, so sharing a key would have whichever mounted second overwrite
     * the other's pages. Keeping them apart costs one small request and means the badge cannot
     * truncate the list to a single row (or the list inflate the badge's payload to twenty).
     *
     * The two are kept in step by invalidation instead — every accept and decline invalidates
     * this key, which is what makes the badge drop as rows leave the screen.
     */
    followRequestsCount: (accountId: string | null) =>
        ['channel', 'follow-requests-count', accountId ?? 'anon'] as const,
    /**
     * The two option lists the edit-profile form fills its pickers from.
     *
     * The **only** keys in this feature with no account in them, and deliberately so: neither
     * answer is personal — the category list and the supported social platforms are the same for
     * everybody — so scoping them per account would refetch both on every switch to receive an
     * identical body. The rule the rest of the file follows ("personalised payload ⇒ account in
     * the key") is what says these two are different, not an exception to it.
     */
    /**
     * The spaces this account follows, for one **ordering** — `/following`.
     *
     * Account-scoped like every other personal list here. The ordering is *in* the key for the
     * reason `blocks` puts its search term there: the two orderings are different lists, so
     * switching between them must not have the second overwrite the first's pages, and switching
     * back must be instant rather than a request.
     */
    followed: (accountId: string | null, ordering: string) =>
        ['channel', 'followed', accountId ?? 'anon', ordering] as const,
    /**
     * Every ordering's list for one account — the prefix `followed` extends.
     *
     * Invalidation scope, and it is what pin, mute and unfollow actually write to: an unfollowed
     * space is still sitting in the *other* ordering's cached pages, and a 60s `staleTime` is long
     * enough for a reader to flip the sort and be shown a space they just unfollowed, with a
     * Unfollow row in its menu that now 404s.
     */
    followedAll: (accountId: string | null) =>
        ['channel', 'followed', accountId ?? 'anon'] as const,
    /**
     * Which of them are on air — the Live now block at the top of the same screen.
     *
     * Its own key rather than a field on the list's, because it is its own request against its own
     * endpoint with its own page size, and it changes on a completely different clock: a stream
     * starts, and no follow has moved.
     */
    followedLives: (accountId: string | null) =>
        ['channel', 'followed-lives', accountId ?? 'anon'] as const,
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
        cursor?: PageCursor | null
        accountId?: string | null
        signal?: AbortSignal
    }) {
        const path = isOwner ? 'v3/channel/my-channel/threads/' : channelPath(slug, 'threads/')
        // Array-valued params repeat their key rather than being bracketed — `apiClient` sets
        // that for every model (`paramsSerializer`), which is what makes a `PageCursor` survive.
        return api.get<Paginated<ChannelThread>>(path, cursor ?? FIRST_PAGE[kind], {
            signal,
            ...(accountId ? { accountId } : {}),
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
    follow(slug: string, notification?: boolean, accountId?: string | null) {
        const body = notification === undefined ? {} : { notification }
        return api.post(channelPath(slug, 'follow/'), body, accountId ? { accountId } : undefined)
    },

    /**
     * `accountId` is optional and **`/following` is the one caller that must pass it.**
     *
     * Everywhere else this fires on the press, so the account that is active when the request is
     * built is the account that was active when the button was pressed, and reading it from the
     * session is correct. `/following` defers the request by five seconds so an Undo can cancel it
     * (`useFollowedChannels`), and five seconds is long enough to use the account switcher — at
     * which point an un-scoped request unfollows the space **on the wrong account**. The write has
     * to land on the account that was active when it was pressed, which is the rule
     * `updatePrivacy` and `updateMyChannel` already state for their own reasons.
     */
    unfollow(slug: string, accountId?: string | null) {
        return api.post(channelPath(slug, 'unfollow/'), {}, accountId ? { accountId } : undefined)
    },

    /**
     * Pin a followed space to the top of `/following`.
     *
     * Its own route (`channels/{slug}/pin/`), not a field on the follow — which is why pinning is
     * not `follow(slug, …)` with a third argument: the two writes have separate endpoints, separate
     * failure messages and, on the wire, nothing in common but the slug.
     *
     * A POST with **no body**, and not retried: `apiClient` replays only idempotent methods unless
     * a call opts in, and B15's question about whether a bare `{}` follow is idempotent applies
     * here for the same reason — nothing tells this client the backend deduplicates it.
     */
    pinChannel(slug: string, accountId?: string | null) {
        return api.post(channelPath(slug, 'pin/'), undefined, accountId ? { accountId } : undefined)
    },

    /** The other half. A POST as well — there is no DELETE on the pin. */
    unpinChannel(slug: string, accountId?: string | null) {
        return api.post(
            channelPath(slug, 'unpin/'),
            undefined,
            accountId ? { accountId } : undefined,
        )
    },

    /**
     * One page of the spaces this bearer follows — `/following`'s list.
     *
     * `accountId` is threaded through rather than read from the active session when the request is
     * built, for the reason `getBlockedAccounts` gives: this is a personal list, and an account
     * switch mid-flight must not have page two answered as somebody else.
     *
     * `ordering` is merged **after** the cursor, exactly as `q` is on the blocked list and for the
     * same reason: page two's params come from the `next` URL the backend built, which echoes the
     * ordering back — so where it is already there the two agree, and where the cursor is our own
     * `{ page, page_size }` fallback this is what carries it. Losing it on page two would silently
     * re-sort the list mid-scroll and repeat rows across pages.
     *
     * Legacy also sends `q=''` on every request. Dropped: `createApiModel` strips empty params, so
     * it was never on the wire, and there is no search field on this screen to fill it.
     *
     * Normalised here rather than at the hook, so the cache-surgery helpers and the view both see
     * `FollowedChannel[]` and never a raw row. `count` is coerced because it is what the limit
     * warning compares against and what the screen announces; `next` is passed through untouched,
     * since `nextFollowedCursor` needs to tell absent from explicitly null.
     */
    async getFollowedChannels({
        cursor,
        ordering,
        accountId,
        signal,
    }: {
        cursor?: PageCursor | null
        ordering: FollowedOrdering
        accountId?: string | null
        signal?: AbortSignal
    }): Promise<FollowedChannelsPage> {
        const body = await api.get<Partial<Paginated<unknown>>>(
            'v3/channel/followed-channels/',
            { ...(cursor ?? FOLLOWING_FIRST_PAGE), ordering },
            { signal, ...(accountId ? { accountId } : {}) },
        )
        const results = normalizeFollowedChannels(body?.results)
        const count = Number(body?.count)
        return {
            // `results.length` and not `0` as the fallback, as on the other two lists: a payload
            // with rows but no `count` should say how many it has rather than claim to be empty.
            results,
            count: Number.isFinite(count) && count >= 0 ? count : results.length,
            next: body?.next,
        }
    },

    /**
     * Which followed spaces are on air right now — the Live now block.
     *
     * **Not paginated, deliberately.** Legacy asks for `limit=10` and its block shows five with a
     * "Show more" that reveals the rest; there is no cursor and no second request, because this is
     * a strip at the top of a screen whose subject is the list below it. Ten is legacy's number and
     * it stays — the expand/collapse is presentation, and `useFollowedLives` owns it.
     *
     * The one endpoint in this file that takes `limit` rather than `page`/`page_size`, which is why
     * it does not go through `PagedList`: there is no `next` to follow and no total to report.
     *
     * A failure is a **rejection**, not an empty array: the block is optional, and the view drops it
     * on error rather than telling a reader that nobody they follow is live when it does not know.
     */
    async getFollowedLives({
        accountId,
        signal,
    }: {
        accountId?: string | null
        signal?: AbortSignal
    } = {}): Promise<FollowedLive[]> {
        const body = await api.get<Partial<Paginated<unknown>>>(
            'v3/channel/followed-channels/lives/',
            { limit: FOLLOWED_LIVES_LIMIT },
            { signal, ...(accountId ? { accountId } : {}) },
        )
        return normalizeFollowedLives(body?.results)
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
            // A taxonomy the backoffice edits, identical for every reader and for a signed-out
            // one — nothing here is the account's.
            { signal, cache: { persist: true, shared: true, ttlMs: CACHE_TTL.day } },
        )
        return normalizeCategoryNames(body?.results)
    },

    /** The platforms a social link may point at. Server-driven — see `socialPlatformSchema`. */
    async getSocialPlatforms(signal?: AbortSignal): Promise<SocialPlatform[]> {
        const body = await api.get<Partial<Paginated<unknown>>>(
            'v3/channel/my-channel/social-links/supported-platforms/',
            { page: 1, page_size: 100 },
            /*
             * Persisted despite the `my-channel/` path: the body is `{ value, name }` per platform —
             * the list of platforms Tevi supports, not this space's links. The path segment says
             * where the write goes, not whose data comes back.
             */
            { signal, cache: { persist: true, shared: true, ttlMs: CACHE_TTL.day } },
        )
        return normalizeSocialPlatforms(body?.results)
    },

    /*
     * `blockUser` / `unblockUser` moved to `@shared/lib/api/blocks-api` once a post's overflow menu
     * needed them — see that file's header for the seam. The blocked-accounts list below stays,
     * because it is one screen's paging and row type rather than an action any surface invokes.
     */

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
        q,
        accountId,
        signal,
    }: {
        cursor?: PageCursor | null
        /**
         * The search term, already trimmed and debounced by the hook. **A guess about the
         * contract** — what the backend matches (display name? handle? both?) is B76.
         * Empty means unfiltered, and `createApiModel` strips it rather than sending `q=`.
         */
        q?: string
        accountId?: string | null
        signal?: AbortSignal
    }): Promise<BlockedAccountsPage> {
        const body = await api.get<Partial<Paginated<unknown>>>(
            'v3/channel/my-channel/blocks/',
            /*
             * `q` merged **after** the cursor, and that order is the point: page two's params
             * come from the `next` URL the backend built, which echoes the term back — so on
             * the paths where it is already there the two agree, and on the paths where the
             * cursor is our own `{ page, page_size }` fallback this is what carries it. Losing
             * it on page two would silently widen the list mid-scroll.
             */
            { ...(cursor ?? BLOCKED_FIRST_PAGE), ...(q ? { q } : {}) },
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

    /**
     * One page of the people asking to follow this bearer's **own** space.
     *
     * `my-channel/follow-requests/` — legacy's endpoint and its page size, unchanged. Only a
     * protected space can have any: a Follow on a protected space becomes `follow_requested`
     * rather than `is_followed` (see `useChannelActions`), and this is the queue that produces.
     *
     * `accountId` is threaded through rather than read from the active session when the request
     * is built, for the reason `getBlockedAccounts` gives: this is a personal list, and an
     * account switch mid-flight must not have page two answered as somebody else.
     *
     * Normalised here rather than at the hook, so the cache-surgery helpers and the view both
     * see `FollowRequest[]` and never a raw row. `count` is coerced because it is what the
     * drawer's badge prints and what the screen announces; `next` is passed through untouched,
     * since `nextFollowRequestCursor` needs to tell absent from explicitly null.
     */
    async getFollowRequests({
        cursor,
        accountId,
        signal,
    }: {
        cursor?: PageCursor | null
        accountId?: string | null
        signal?: AbortSignal
    } = {}): Promise<FollowRequestsPage> {
        const body = await api.get<Partial<Paginated<unknown>>>(
            'v3/channel/my-channel/follow-requests/',
            cursor ?? FOLLOW_REQUESTS_FIRST_PAGE,
            { signal, ...(accountId ? { accountId } : {}) },
        )
        const results = normalizeFollowRequests(body?.results)
        const count = Number(body?.count)
        return {
            results,
            // `results.length` and not `0` as the fallback, as on the blocked list: a payload
            // with rows but no `count` should say how many it has rather than claim to be empty.
            count: Number.isFinite(count) && count >= 0 ? count : results.length,
            next: body?.next,
        }
    },

    /**
     * How many follow requests are pending — the number on the drawer's badge.
     *
     * The same endpoint asked for **one row**, because there is no count-only route; legacy does
     * exactly this (`getFollowRequests(1, 1)`). `results` is dropped on the floor here on
     * purpose: a caller that renders rows must use `getFollowRequests`, and returning a
     * one-row page from a function called `…Count` is how a badge ends up being the list.
     *
     * `-1` is not a fallback anywhere here — a count that failed to load is a rejected promise,
     * so the badge can be absent rather than claim zero.
     */
    async getFollowRequestsCount({
        accountId,
        signal,
    }: {
        accountId?: string | null
        signal?: AbortSignal
    } = {}): Promise<number> {
        const body = await api.get<Partial<Paginated<unknown>>>(
            'v3/channel/my-channel/follow-requests/',
            FOLLOW_REQUESTS_COUNT_PAGE,
            { signal, ...(accountId ? { accountId } : {}) },
        )
        const count = Number(body?.count)
        /*
         * A payload with no usable `count` falls back to what it *did* carry — `results.length`,
         * so 0 or 1 — rather than to 0. It is a badge: "at least one" is the useful half of the
         * answer and it is the half this can still be sure of.
         */
        if (Number.isFinite(count) && count >= 0) return count
        return Array.isArray(body?.results) ? body.results.length : 0
    },

    /**
     * Let one person in. `id` is the **request's** id, not the requester's — see
     * `followRequestSchema` and B77.
     *
     * A POST with no body, and it is not retried: `apiClient` replays only idempotent methods
     * unless a call opts in (`{ retry: true }`), and accepting twice is not a thing this client
     * knows the backend tolerates.
     */
    acceptFollowRequest(requestId: string) {
        return api.post(
            `v3/channel/my-channel/follow-requests/${encodeURIComponent(requestId)}/accept/`,
        )
    },

    /**
     * Turn one person away. **A DELETE on the request itself** — there is no `decline/` verb;
     * declining is removing the row, which is legacy's own shape here.
     */
    declineFollowRequest(requestId: string) {
        return api.del(`v3/channel/my-channel/follow-requests/${encodeURIComponent(requestId)}/`)
    },

    /** Let everybody in. Server-side bulk — the client never loops over the loaded pages. */
    acceptAllFollowRequests() {
        return api.post('v3/channel/my-channel/follow-requests/accept-all/')
    },

    /** Turn everybody away. A DELETE, like the single decline it repeats. */
    declineAllFollowRequests() {
        return api.del('v3/channel/my-channel/follow-requests/decline-all/')
    },
}

export { FIRST_PAGE as CHANNEL_FIRST_PAGE }
