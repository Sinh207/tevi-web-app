import type { PageCursor } from '@shared/lib/api/page-cursor'
import {
    firstPageParams,
    nextPagedCursor,
    type PagedList,
    removeListRow,
} from '@shared/lib/api/paged-list'
import type { InfiniteData } from '@tanstack/react-query'
import type { BlockedAccount } from '../api/types'

/**
 * Paging and cache surgery for the blocked-accounts list.
 *
 * The two rules themselves — how the last page is recognised, and how a row is taken out of a
 * cached `InfiniteData` — live in [`shared/lib/api/paged-list.ts`](../../../shared/lib/api/paged-list.ts), because the
 * follow-requests list is the same DRF list and needed the same pair. What is left here is what
 * is actually this list's own: its page size, and the reading of the contract that page size
 * encodes.
 *
 * Kept as named wrappers rather than having the hook call the generics with a page size at the
 * call site: `nextBlockedCursor` is what `getNextPageParam` reads as, the page size cannot be
 * forgotten at one of two call sites, and the existing tests keep testing the thing the hook
 * actually calls.
 */

/**
 * Legacy's page size (`ChannelModel.getBlockedUsers(page, 20)`), and it is load-bearing
 * twice over: it is the request's `page_size` *and* the number the short-page stop condition
 * compares against. Changing one without the other makes the list stop after one page or
 * never stop at all, which is why it is one constant.
 */
export const BLOCKED_PAGE_SIZE = 20

/** The first request's params. `page` is explicit so the fallback cursor can count from it. */
export const BLOCKED_FIRST_PAGE: PageCursor = firstPageParams(BLOCKED_PAGE_SIZE)

/** A page of blocks as the endpoint returns it — see `PagedList` for what `next` means. */
export type BlockedAccountsPage = PagedList<BlockedAccount>

/** The params for the next page, or `undefined` when there is none. See `nextPagedCursor`. */
export function nextBlockedCursor(
    page: BlockedAccountsPage,
    current: PageCursor | null,
): PageCursor | undefined {
    return nextPagedCursor(page, current, BLOCKED_PAGE_SIZE)
}

/** Drop one block from every page of the cached list. See `removeListRow`. */
export function removeBlockedAccount(
    data: InfiniteData<BlockedAccountsPage, PageCursor | null> | undefined,
    id: string,
): InfiniteData<BlockedAccountsPage, PageCursor | null> | undefined {
    return removeListRow(data, id)
}
