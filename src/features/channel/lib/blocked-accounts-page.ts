import type { InfiniteData } from '@tanstack/react-query'
import type { BlockedAccount } from '../api/types'
import { paramsFromNextUrl, type ThreadCursor } from './next-page-param'

/**
 * Paging and cache surgery for the blocked-accounts list.
 *
 * Pure functions, in their own file with their own tests, because both of them are the kind
 * of thing that fails *quietly*: a stop condition that never fires shows an infinite list
 * that keeps re-requesting the last page, and a removal that misses shows a row the server
 * no longer has. Neither throws, so neither would surface in an error boundary.
 */

/**
 * Legacy's page size (`ChannelModel.getBlockedUsers(page, 20)`), and it is load-bearing
 * twice over: it is the request's `page_size` *and* the number the short-page stop condition
 * compares against. Changing one without the other makes the list stop after one page or
 * never stop at all, which is why it is one constant.
 */
export const BLOCKED_PAGE_SIZE = 20

/** The first request's params. `page` is explicit so the fallback cursor can count from it. */
export const BLOCKED_FIRST_PAGE: ThreadCursor = {
    page: ['1'],
    page_size: [String(BLOCKED_PAGE_SIZE)],
}

/**
 * A page of blocks as the endpoint returns it, **after** the response interceptor has
 * stripped one `{ data }` level.
 *
 * `next` is `string | null | undefined` and the three are genuinely different here:
 * a **string** is a cursor, an explicit **null** is the API saying "last page", and
 * **undefined** means the payload has no such key — which is the case this shape exists for.
 * Legacy never reads `next` on this endpoint; it infers the end from a short page. That is
 * evidence the key may not be there, so the client cannot depend on it, and collapsing null
 * into undefined would throw away the one authoritative answer when it *is* there.
 */
export interface BlockedAccountsPage {
    results: BlockedAccount[]
    count: number
    next?: string | null
}

/**
 * The params for the next page, or `undefined` when there is none.
 *
 * **`undefined`, never `null`** — `null` is a legitimate page param, so returning it leaves
 * `hasNextPage` true forever and the sentinel re-fires against a list with nothing left.
 * Same trap `nextPageParam` documents for the threads list.
 *
 * Three rules, in order:
 *
 * 1. `next === null` — the API said this is the last page. Authoritative, and checked first,
 *    so an exact multiple of the page size (20 blocks, `next: null`) does not cost a request
 *    that comes back empty.
 * 2. A short page is the last page. This is legacy's own rule and the only one that works
 *    when the payload has no `next` at all.
 * 3. Otherwise: the parsed `next` if there is one, else `page + 1` counted off the cursor
 *    that produced this page.
 *
 * The fallback counts from `current` rather than from an internal counter because
 * `useInfiniteQuery` may re-run any page (a refetch replays them all), and a counter would
 * drift on every one of those.
 */
export function nextBlockedCursor(
    page: BlockedAccountsPage,
    current: ThreadCursor | null,
): ThreadCursor | undefined {
    if (page.next === null) return undefined
    if (page.results.length < BLOCKED_PAGE_SIZE) return undefined

    const fromNext = paramsFromNextUrl(page.next)
    if (fromNext) return fromNext

    const currentPage = Number(current?.page?.[0] ?? BLOCKED_FIRST_PAGE.page[0])
    const nextPage = Number.isFinite(currentPage) && currentPage >= 1 ? currentPage + 1 : 2
    return { page: [String(nextPage)], page_size: [String(BLOCKED_PAGE_SIZE)] }
}

/**
 * Drop one block from every page of the cached list, and take the total down with it.
 *
 * Returns the **same object** when the id is not there, so `setQueryData` does not
 * re-render every subscriber for a removal that removed nothing — which happens on the
 * second call for the same row (a double-tap the pending state did not quite catch, a
 * mutation retried).
 *
 * `count` lives on every page and is the total rather than the number loaded, so it is
 * decremented once and written to all of them; floored at zero, because a `count` the
 * backend was already under-reporting must not render as `-1 blocked accounts`.
 */
export function removeBlockedAccount(
    data: InfiniteData<BlockedAccountsPage, ThreadCursor | null> | undefined,
    id: string,
): InfiniteData<BlockedAccountsPage, ThreadCursor | null> | undefined {
    if (!data) return data
    const found = data.pages.some(page => page.results.some(row => row.id === id))
    if (!found) return data

    return {
        ...data,
        pages: data.pages.map(page => ({
            ...page,
            count: Math.max(0, page.count - 1),
            results: page.results.filter(row => row.id !== id),
        })),
    }
}
