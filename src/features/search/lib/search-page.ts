import type { PageCursor } from '@shared/lib/api/page-cursor'
import { firstPageParams, nextPagedCursor, type PagedList } from '@shared/lib/api/paged-list'
import type { SearchChannel } from '../api/types'

/**
 * Paging for the global results list.
 *
 * The rules are [`shared/lib/api/paged-list.ts`](../../../shared/lib/api/paged-list.ts)'s — this
 * is the same DRF `?page=&page_size=` list as the blocked accounts and the follow requests — so
 * what is here is this list's page size and nothing else. No cache surgery: nothing on this
 * screen removes or patches a result row, so `removeListRow` has no call site to earn.
 *
 * Kept as a named wrapper rather than calling the generic with a page size at the hook: the page
 * size cannot then be forgotten at one of two places (the request and the stop condition), and
 * `nextSearchCursor` is what `getNextPageParam` reads as.
 */

/**
 * Legacy's page size (`PAGE_SIZE` in `containers/search/hooks/useSearch`), and load-bearing
 * twice over as on the other numbered lists: it is the request's `page_size` *and* the number
 * the short-page stop condition compares against. Changing one without the other makes the list
 * stop after one page or never stop at all, which is why it is one constant.
 */
export const SEARCH_PAGE_SIZE = 20

/** The first request's params. `page` is explicit so the fallback cursor can count from it. */
export const SEARCH_FIRST_PAGE: PageCursor = firstPageParams(SEARCH_PAGE_SIZE)

/** A page of results as the endpoint returns it — see `PagedList` for what `next` means. */
export type SearchChannelsPage = PagedList<SearchChannel>

/** The params for the next page, or `undefined` when there is none. See `nextPagedCursor`. */
export function nextSearchCursor(
    page: SearchChannelsPage,
    current: PageCursor | null,
): PageCursor | undefined {
    return nextPagedCursor(page, current, SEARCH_PAGE_SIZE)
}

/**
 * How many followed spaces the grid asks for.
 *
 * Legacy's `getFollowedChannels(1, 20, q)` — one page, never paginated, which is the right shape
 * for the control it feeds: a block of tiles that is entirely on screen, not a list you scroll to
 * the end of. Somebody who follows four hundred spaces and types a single letter is offered the
 * twenty closest matches, and the list *below* the grid is the exhaustive answer.
 *
 * It is a **ceiling rather than a typical size**, and that is what makes rendering all of them
 * affordable now the grid wraps instead of scrolling: the list is filtered by the search term
 * server-side, so a real search matches one or two of the spaces you follow. Twenty is what a
 * one-character term costs, and five rows of faces is a fair answer to that question.
 *
 * A different constant from `SEARCH_PAGE_SIZE` even though both are 20: they answer different
 * questions (a page of an infinite list, versus the whole of a bounded one) and one of them moving
 * is not a reason for the other to.
 */
export const FOLLOWING_GRID_SIZE = 20

/**
 * How many followed spaces `/search` shows — idle and typed alike.
 *
 * The Figma Search page: "Following → 10 kết quả phù hợp nhất". It is a list now rather than the
 * strip `FOLLOWING_GRID_SIZE` feeds, and the exhaustive answer is behind *View all* (`/following`)
 * or in the Global search list below it, so ten is the whole of what this section offers.
 */
export const SEARCH_FOLLOWING_SIZE = 10
