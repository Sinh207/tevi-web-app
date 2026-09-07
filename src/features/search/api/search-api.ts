import { env } from '@shared/config/env'
import { createApiModel } from '@shared/lib/api/model'
import type { PageCursor } from '@shared/lib/api/page-cursor'
import type { PagedList } from '@shared/lib/api/paged-list'
import { FOLLOWING_GRID_SIZE, SEARCH_FIRST_PAGE, type SearchChannelsPage } from '../lib/search-page'
import { normalizeSearchChannels, type SearchChannel } from './types'

/**
 * **Its own service**, which is the one thing about this feature that is not like the others:
 * `${W_API}/search`, not `/core`. Legacy models it separately for the same reason
 * (`models/apiSearch.js`), and it matters because the gateway routes the two independently — a
 * search outage is not a channel outage, and the reverse.
 */
const searchService = createApiModel({ apiBase: `${env.NEXT_PUBLIC_W_API_DOMAIN}/search` })

/**
 * The channel service, for the **Following** grid only.
 *
 * `followed-channels/` lives on `/core` and is, on paper, `features/channel`'s endpoint — legacy
 * hangs it off `ChannelModel`. It is called from here rather than through that feature's barrel
 * for the plain reason that a feature may not reach into another feature's internals, and
 * `channelApi` is deliberately *not* exported (its barrel says so, at length: "A component
 * calling `channelApi` directly is exactly what CLAUDE.md's 'never call axios from components'
 * forbids, and exporting it is the invitation").
 *
 * The two callers also want different things from it, which is what makes a shared method a
 * worse fit than it looks: the `/following` screen wants an infinite, orderable, mutable list
 * (pin, mute, unfollow), and this wants **one page, filtered by a term, read-only**. Same URL,
 * different question.
 *
 * ⚠ If `features/channel` ever publishes a followed-channels *hook* on its barrel, this method
 * is the thing to delete — a grid driven by that hook would share its cache with the
 * `/following` screen instead of holding a second copy. Until then this is a second call site,
 * knowingly.
 */
const channelService = createApiModel({ apiBase: `${env.NEXT_PUBLIC_W_API_DOMAIN}/core` })

/**
 * Query keys for the search feature.
 *
 * **Both keys carry the term and the account id**, and both halves are load-bearing:
 *
 * - The **term** is in the key rather than being a parameter the hook re-fetches with, so
 *   backspacing to a prefix that was already typed is a cache hit and not a request, and so
 *   clearing the field is instant. That is the same shape `channelKeys.blocks(accountId, q)`
 *   uses; see `useChannelSearch` for why the debounce lives in the hook rather than in the field.
 * - The **account** is in the key because both payloads are personalised. Obvious for the
 *   followed list; less so for global search, which is why it is worth saying: results carry
 *   nothing viewer-relative today, but the backend is free to rank or filter them per account
 *   (blocked spaces are the case that will show up first), and an un-scoped key hands account B
 *   whatever account A saw the moment somebody uses the switcher. Same reasoning as
 *   `channelKeys.detail`, which looks like it needs only a slug and does not.
 */
export const searchKeys = {
    all: ['search'] as const,
    channels: (q: string, accountId: string | null) =>
        ['search', 'channels', q, accountId ?? 'anon'] as const,
    following: (q: string, accountId: string | null) =>
        ['search', 'following', q, accountId ?? 'anon'] as const,
}

export const searchApi = {
    /**
     * One page of spaces matching `q` — `GET search/v3/channel/`.
     *
     * `accountId` is threaded through rather than read from the active session when the request
     * is built, for the reason `getBlockedAccounts` gives: an account switch mid-flight must not
     * have page two answered as somebody else, and the key this lands under already names an
     * account.
     *
     * `q` is merged **after** the cursor, and that order is the point: page two's params come
     * from the `next` URL the backend built, which echoes the term back — so where it is already
     * there the two agree, and where the cursor is our own `{ page, page_size }` fallback this is
     * what carries it. Losing it on page two would silently widen the list mid-scroll. Copied
     * from `channelApi.getBlockedAccounts`, where the same trap is documented.
     *
     * `count` is coerced because it is announced to screen readers, and a missing envelope field
     * would otherwise read as `NaN`; `next` is passed through untouched, since `nextSearchCursor`
     * needs to tell absent from explicitly null.
     */
    async searchChannels({
        cursor,
        q,
        accountId,
        signal,
    }: {
        cursor?: PageCursor | null
        /**
         * The term, already trimmed and debounced by the hook. **A guess about the contract** —
         * whether the backend matches the display name, the handle or both is B78. Empty is
         * never sent: `createApiModel` strips it, and the hook does not ask at all.
         */
        q: string
        accountId?: string | null
        signal?: AbortSignal
    }): Promise<SearchChannelsPage> {
        const body = await searchService.get<Partial<PagedList<unknown>>>(
            'v3/channel/',
            { ...(cursor ?? SEARCH_FIRST_PAGE), ...(q ? { q } : {}) },
            { signal, ...(accountId ? { accountId } : {}) },
        )
        const results = normalizeSearchChannels(body?.results)
        const count = Number(body?.count)
        return {
            // `results.length` and not `0` as the fallback, as on the other numbered lists: a
            // payload with rows but no `count` should say how many it has rather than claim to
            // be empty above a full list.
            count: Number.isFinite(count) && count >= 0 ? count : results.length,
            results,
            next: body?.next,
        }
    },

    /**
     * The spaces this account follows that match `q` — `GET core/v3/channel/followed-channels/`.
     *
     * Returns a **bare array**, not a page, and that is the honest signature: the grid asks for one
     * page and has no way to ask for a second (see `FOLLOWING_GRID_SIZE`), so handing back a
     * `count` and a `next` that nothing reads would invite somebody to build pagination on a block
     * of tiles that is meant to be seen whole.
     *
     * `ordering` is not sent. Legacy's parameter exists for its `/following` screen's sort
     * control; here the server's default order is the only sensible one — "the spaces you follow
     * that match what you typed" has no user-chosen sort, and picking one would be this screen
     * inventing a ranking. It matters a little more now the grid shows every row it is given:
     * whatever the server puts first is what lands in the top-left tile.
     */
    async getFollowedChannels({
        q,
        accountId,
        signal,
    }: {
        q: string
        accountId?: string | null
        signal?: AbortSignal
    }): Promise<SearchChannel[]> {
        const body = await channelService.get<Partial<PagedList<unknown>>>(
            'v3/channel/followed-channels/',
            { page: 1, page_size: FOLLOWING_GRID_SIZE, ...(q ? { q } : {}) },
            { signal, ...(accountId ? { accountId } : {}) },
        )
        return normalizeSearchChannels(body?.results)
    },
}
