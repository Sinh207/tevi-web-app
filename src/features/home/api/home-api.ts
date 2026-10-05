import { normalizePosts, type Post } from '@features/post'
import { env } from '@shared/config/env'
import { createApiModel } from '@shared/lib/api/model'
import type { PageCursor } from '@shared/lib/api/page-cursor'

/**
 * The home feed — `core/v3/channel/followed-channels/threads/`.
 *
 * ## One endpoint, and why it is not in `features/channel`
 *
 * The path sits under `v3/channel/`, and `features/channel` already owns its neighbours — the
 * follow list, the follow requests, and `followed-channels/lives/`. The argument for moving this
 * one in with them is real and was weighed; what decided against it is that **the rows are posts,
 * not channels**. Everything this module does after the request — grouping consecutive posts by
 * author, collapsing a run of four into one card with a *See more* — is feed presentation, and
 * `features/channel` has no business holding it. The alternative put a post-grouping algorithm in
 * the feature whose subject is spaces.
 *
 * So the seam is: the **request** is duplicated (one `createApiModel` on `/core`, four lines), and
 * the **presentation** lives with the surface that presents it. That is the cheaper of the two
 * duplications. `features/channel`'s own barrel note anticipates this exact fork and says the
 * follow-list cluster is what would move, not this.
 *
 * The **lives** half of home is the opposite case and is *not* duplicated: it is a list of
 * channels, its rows are `FollowedLive`, and `features/channel` already renders them for
 * `/following`. Home imports that hook rather than re-fetching. `home → channel` is a legal
 * direction; nothing in `features/channel` imports this feature.
 *
 * ## Rows are parsed by `features/post`, never by this file
 *
 * `normalizePosts` is exported from that barrel precisely so a surface owning a list can parse its
 * rows with the post schema without routing the request through the post feature's model
 * (`post-api.ts` says so). A second copy of the schema here is the thing that would drift.
 */
const api = createApiModel({ apiBase: `${env.NEXT_PUBLIC_W_API_DOMAIN}/core` })

/**
 * Query keys.
 *
 * **Account-scoped.** The feed *is* the account — it is the posts of the spaces this bearer
 * follows, and every row is additionally viewer-relative (`is_owner`, `is_bookmark`,
 * `need_unlock_package`, `viewer`). A key shared across accounts would show one reader another's
 * feed, unlock state included. Same rule `postKeys` states, and the reason nothing here may be
 * given `cache: { shared: true }`.
 */
export const homeKeys = {
    /** Everything this feature caches — the prefix a sign-out drops. */
    all: ['home'] as const,
    feed: (accountId: string | null) => ['home', 'feed', accountId ?? 'anon'] as const,
}

/**
 * Legacy's own page size for the home feed (`POSTS_LIMIT`).
 *
 * Twenty rather than the ten a reply list uses: a post is tall, but the grouping below can collapse
 * a run of four into a single card, so a page of twenty can render as far fewer cards than twenty —
 * which is exactly why `useHomeFeed` keeps asking until it has enough to fill a screen.
 */
export const FEED_PAGE_SIZE = 20

export const homeApi = {
    /**
     * One page of the feed.
     *
     * Cursor-paginated on a `next` **URL the client must not fetch** —
     * `shared/lib/api/page-cursor.ts` explains why (an internal hostname, and the credential rules
     * in `origins.ts`). The cursor **replaces** the first page's params rather than merging with
     * them: legacy sends `limit` alongside an already-complete cursor query, which duplicates
     * whatever the cursor carried.
     *
     * A row that will not parse is **dropped**, the page is not — `normalizePosts`' rule, and the
     * right one for the highest-volume payload in the product: one malformed row costs that row,
     * not the feed.
     */
    async getFeed({
        cursor,
        accountId,
        signal,
    }: {
        cursor?: PageCursor | null
        accountId?: string | null
        signal?: AbortSignal
    }): Promise<{ results: Post[]; next: string | null }> {
        const body = await api.get<{ results?: unknown; next?: string | null }>(
            'v3/channel/followed-channels/threads/',
            cursor ?? { limit: FEED_PAGE_SIZE },
            { signal, ...(accountId ? { accountId } : {}) },
        )
        return { results: normalizePosts(body?.results), next: body?.next ?? null }
    },
}
