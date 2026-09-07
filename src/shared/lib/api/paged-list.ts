import type { InfiniteData } from '@tanstack/react-query'
import { type PageCursor, paramsFromNextUrl } from './page-cursor'

/**
 * Paging and cache surgery for every **page-numbered** DRF list in the app — the blocked
 * accounts, the follow requests, the following list, the notification inbox.
 *
 * ## Why they share a file rather than a copy each
 *
 * They are the same DRF list: `?page=&page_size=`, a `results` array of rows with an `id`, a
 * `count` that is the total rather than the number loaded, and a `next` the payload may or may
 * not carry. Both need exactly two things from that — the params for the next page, and a way
 * to take one row out of an `InfiniteData` without refetching — and both of those fail
 * *quietly*: a stop condition that never fires shows an infinite list re-requesting its last
 * page, and a removal that misses shows a row the server no longer has, with a button that
 * 404s. Neither throws, so neither surfaces in an error boundary. One implementation with its
 * own tests is the only version where a fix reaches both lists.
 *
 * What stays per list is what genuinely differs: the page size, the endpoint, and the row type.
 * Those live in each feature's own `*-page.ts` — `blocked-accounts-page.ts`,
 * `follow-requests-page.ts`, `notification/lib/inbox-page.ts` — which is also where each list's
 * own reading of the contract is written down.
 *
 * It sits in `shared/` rather than in `features/channel`, where it was written, for the plain
 * reason that a feature may not import another feature's internals: the inbox is the same DRF
 * list as the follow requests, and the only two ways to give it these rules were a barrel export
 * from an unrelated feature or a fourth copy of them.
 *
 * The **cursor-**paginated threads list is deliberately not folded in here: it has no page
 * number to count from, so `nextPageParam` in [`page-cursor.ts`](./page-cursor.ts) is the whole
 * of its rule.
 */

/**
 * A page of a numbered list, **after** the response interceptor has stripped one `{ data }`
 * level.
 *
 * `next` is `string | null | undefined` and the three are genuinely different:
 * a **string** is a cursor, an explicit **null** is the API saying "last page", and
 * **undefined** means the payload has no such key — which is the case this shape exists for.
 * Legacy reads `next` on neither of these endpoints; it infers the end from a short page. That
 * is evidence the key may not be there, so the client cannot depend on it, and collapsing null
 * into undefined would throw away the one authoritative answer when it *is* there.
 */
export interface PagedList<T> {
    results: T[]
    count: number
    next?: string | null
}

/** The first request's params. `page` is explicit so the fallback cursor can count from it. */
export function firstPageParams(pageSize: number): PageCursor {
    return { page: ['1'], page_size: [String(pageSize)] }
}

/**
 * The params for the next page, or `undefined` when there is none.
 *
 * **`undefined`, never `null`** — `null` is a legitimate page param, so returning it leaves
 * `hasNextPage` true forever and the sentinel re-fires against a list with nothing left. Same
 * trap `nextPageParam` documents for the threads list.
 *
 * Three rules, in order:
 *
 * 1. `next === null` — the API said this is the last page. Authoritative, and checked first,
 *    so an exact multiple of the page size (20 rows, `next: null`) does not cost a request
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
export function nextPagedCursor<T>(
    page: PagedList<T>,
    current: PageCursor | null,
    pageSize: number,
): PageCursor | undefined {
    if (page.next === null) return undefined
    if (page.results.length < pageSize) return undefined

    const fromNext = paramsFromNextUrl(page.next)
    if (fromNext) return fromNext

    const currentPage = Number(current?.page?.[0] ?? '1')
    const nextPage = Number.isFinite(currentPage) && currentPage >= 1 ? currentPage + 1 : 2
    return { page: [String(nextPage)], page_size: [String(pageSize)] }
}

/**
 * Drop one row from every page of a cached list, and take the total down with it.
 *
 * Returns the **same object** when the id is not there, so `setQueryData` does not re-render
 * every subscriber for a removal that removed nothing — which happens on the second call for
 * the same row (a double-tap the pending state did not quite catch, a mutation retried).
 *
 * `count` lives on every page and is the total rather than the number loaded, so it is
 * decremented once and written to all of them; floored at zero, because a `count` the backend
 * was already under-reporting must not render as `-1`.
 */
export function removeListRow<T extends { id: string }>(
    data: InfiniteData<PagedList<T>, PageCursor | null> | undefined,
    id: string,
): InfiniteData<PagedList<T>, PageCursor | null> | undefined {
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

/**
 * Empty a cached list in place — every page, and the total with it.
 *
 * For the bulk actions: Accept all / Decline all clear the whole list server-side, and a screen
 * that waits for a refetch to notice keeps offering Accept buttons on rows that are already
 * gone. The **first** page is kept rather than the array being emptied, so the query stays a
 * loaded query with a `count` of 0 — dropping every page would put the list back into
 * `isLoading` and flash the skeleton over an empty state.
 *
 * Returns the same object when there was nothing to clear, for the reason `removeListRow` does.
 */
export function clearListRows<T extends { id: string }>(
    data: InfiniteData<PagedList<T>, PageCursor | null> | undefined,
): InfiniteData<PagedList<T>, PageCursor | null> | undefined {
    if (!data) return data
    if (data.pages.every(page => page.results.length === 0) && data.pages[0]?.count === 0) {
        return data
    }
    return {
        ...data,
        pages: [{ results: [], count: 0, next: null }],
        pageParams: data.pageParams.slice(0, 1),
    }
}
