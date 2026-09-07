import type { PageCursor } from '@shared/lib/api/page-cursor'
import {
    clearListRows,
    firstPageParams,
    nextPagedCursor,
    type PagedList,
    removeListRow,
} from '@shared/lib/api/paged-list'
import type { InfiniteData } from '@tanstack/react-query'
import type { FollowRequest } from '../api/types'

/**
 * Paging and cache surgery for the follow-requests list.
 *
 * The rules are [`shared/lib/api/paged-list.ts`](../../../shared/lib/api/paged-list.ts)'s — the same DRF list the blocked accounts
 * are — so what is here is this list's own page size and the two things it needs that the
 * blocked list does not: an **empty** operation, because this screen has bulk actions, and a
 * separate cheap request for the badge count.
 */

/**
 * Legacy's page size (`ChannelModel.getFollowRequests(page = 1, page_size = 20)`), and it is
 * load-bearing twice over: it is the request's `page_size` *and* the number the short-page stop
 * condition compares against. Changing one without the other makes the list stop after one page
 * or never stop at all, which is why it is one constant.
 */
export const FOLLOW_REQUESTS_PAGE_SIZE = 20

/** The first request's params. `page` is explicit so the fallback cursor can count from it. */
export const FOLLOW_REQUESTS_FIRST_PAGE: PageCursor = firstPageParams(FOLLOW_REQUESTS_PAGE_SIZE)

/**
 * One row's worth, for the drawer's badge.
 *
 * The endpoint has no count-only route, so the count *is* a list request — legacy asks for
 * `getFollowRequests(1, 1)` and reads `count` off the envelope. One row rather than zero because
 * `page_size=0` is a DRF request for the *default* page size on some paginators and an error on
 * others, and neither is worth finding out on a badge.
 */
export const FOLLOW_REQUESTS_COUNT_PAGE: PageCursor = firstPageParams(1)

/** A page of follow requests as the endpoint returns it — see `PagedList` for what `next` means. */
export type FollowRequestsPage = PagedList<FollowRequest>

/** The params for the next page, or `undefined` when there is none. See `nextPagedCursor`. */
export function nextFollowRequestCursor(
    page: FollowRequestsPage,
    current: PageCursor | null,
): PageCursor | undefined {
    return nextPagedCursor(page, current, FOLLOW_REQUESTS_PAGE_SIZE)
}

/** Drop one request from every page of the cached list. See `removeListRow`. */
export function removeFollowRequest(
    data: InfiniteData<FollowRequestsPage, PageCursor | null> | undefined,
    id: string,
): InfiniteData<FollowRequestsPage, PageCursor | null> | undefined {
    return removeListRow(data, id)
}

/**
 * Empty the cached list — what Accept all / Decline all leave behind. See `clearListRows`.
 *
 * The server has already acted on every row by the time this runs, so this is not an optimistic
 * write: it is the screen catching up with an answer it has. The refetch behind it is what
 * brings in anything that arrived while the bulk request was in flight.
 */
export function clearFollowRequests(
    data: InfiniteData<FollowRequestsPage, PageCursor | null> | undefined,
): InfiniteData<FollowRequestsPage, PageCursor | null> | undefined {
    return clearListRows(data)
}
