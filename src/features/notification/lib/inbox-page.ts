import type { PageCursor } from '@shared/lib/api/page-cursor'
import {
    clearListRows,
    firstPageParams,
    nextPagedCursor,
    type PagedList,
    removeListRow,
} from '@shared/lib/api/paged-list'
import type { InfiniteData } from '@tanstack/react-query'
import type { InboxMessage } from '../api/types'

/**
 * Paging and cache surgery for the notification inbox.
 *
 * The rules are [`shared/lib/api/paged-list.ts`](../../../shared/lib/api/paged-list.ts)'s — this is
 * the same `?page=&page_size=` DRF list the follow requests and the blocked accounts are — so what
 * lives here is this list's own page size plus the two writes it needs that no other list does:
 * flipping **one row's** read flag, and flipping **every loaded row's** at once.
 *
 * ## Why the read flag is written into the cache and the balance is not
 *
 * CLAUDE.md's rule is that a socket frame is a signal and never a source, and that server data is
 * never mirrored. Neither is being broken here. `read` is not a figure this client was *told* — it
 * is the outcome of a request this client just made and the server agreed to, on a row already in
 * hand. Writing it is the same move `removeListRow` makes for an unblock: it is the list catching
 * up with an answer it has, not a second copy of state. Nothing here invents a value the server
 * did not confirm, and nothing here runs before the response.
 *
 * The one thing that *is* refetched rather than written is the **unread badge**, because its number
 * counts rows this browser has never loaded — see `notificationKeys.unread`.
 */

/**
 * Legacy's page size (`getInboxMessages(page = 1, page_size = 20)`), and load-bearing twice: it is
 * the request's `page_size` **and** the number the short-page stop condition compares against.
 * Changing one without the other makes the list stop after one page or never stop at all, which is
 * why it is one constant.
 */
export const INBOX_PAGE_SIZE = 20

/** The first request's params. `page` is explicit so the fallback cursor can count from it. */
export const INBOX_FIRST_PAGE: PageCursor = firstPageParams(INBOX_PAGE_SIZE)

/**
 * One row's worth, for the unread indicator.
 *
 * There is no count-only route, so "is there anything unread" *is* a list request — legacy asks
 * `getInboxMessagesUnread(1, 1)` and tests whether `results` is non-empty. One row rather than
 * zero, because `page_size=0` is a request for the paginator's *default* size on some DRF
 * configurations and an error on others, and neither is worth discovering on a dot in the navbar.
 */
export const INBOX_UNREAD_PAGE: PageCursor = firstPageParams(1)

/** A page of notifications as the endpoint returns it — see `PagedList` for what `next` means. */
export type InboxPage = PagedList<InboxMessage>

/** The cached list, spelled once — this type appears in every `setQueryData` call below. */
export type InboxData = InfiniteData<InboxPage, PageCursor | null> | undefined

/** The params for the next page, or `undefined` when there is none. See `nextPagedCursor`. */
export function nextInboxCursor(
    page: InboxPage,
    current: PageCursor | null,
): PageCursor | undefined {
    return nextPagedCursor(page, current, INBOX_PAGE_SIZE)
}

/**
 * Set one row's `read` flag in every page that holds it.
 *
 * Returns the **same object** when nothing changes — the row is not loaded, or is already in that
 * state — so `setQueryData` does not re-render every subscriber for a write that wrote nothing.
 * That is not a micro-optimisation on this screen: opening a notification marks it read, and
 * arriving at a row that was already read is the common case.
 */
export function setInboxRead(data: InboxData, id: string, read: boolean): InboxData {
    if (!data) return data
    const changes = data.pages.some(page =>
        page.results.some(row => row.id === id && row.read !== read),
    )
    if (!changes) return data

    return {
        ...data,
        pages: data.pages.map(page => ({
            ...page,
            results: page.results.map(row => (row.id === id ? { ...row, read } : row)),
        })),
    }
}

/**
 * Mark every **loaded** row read — what "Mark all as read" leaves behind.
 *
 * "Loaded" is the honest scope and the reason this is not the whole story: the server marks the
 * account's entire inbox, including pages this browser has never fetched, so the badge is
 * invalidated rather than cleared locally. What this does is stop the twenty rows on screen from
 * still looking unread while the truth is a refetch away.
 *
 * Unlike `clearInbox` below, the rows stay: a read notification is still a notification. Only the
 * tint and the weight change.
 */
export function markInboxAllRead(data: InboxData): InboxData {
    if (!data) return data
    if (data.pages.every(page => page.results.every(row => row.read))) return data

    return {
        ...data,
        pages: data.pages.map(page => ({
            ...page,
            results: page.results.map(row => (row.read ? row : { ...row, read: true })),
        })),
    }
}

/**
 * Drop one notification from every page of the cached list, and take `count` down with it — what
 * Delete leaves behind. See `removeListRow`.
 *
 * The wire calls it **archive**, not delete, and this client keeps legacy's word for the *button*
 * ("Delete") because that is what the action does from the reader's side: the row leaves and there
 * is no archive screen in either app to find it in. The distinction still matters here — it is why
 * the row is removed rather than expecting a 404 on a later fetch.
 */
export function removeInboxMessage(data: InboxData, id: string): InboxData {
    return removeListRow(data, id)
}

/**
 * Empty the cached list.
 *
 * Only used when the **filter** changes: turning a notification type off removes rows the server
 * will no longer return, and there is no way to know which loaded rows those were from the
 * settings payload alone. See `clearListRows` for why the first page is kept rather than the array
 * emptied — dropping every page puts the query back into `isLoading` and flashes the skeleton over
 * a list that is about to be repopulated.
 */
export function clearInbox(data: InboxData): InboxData {
    return clearListRows(data)
}
