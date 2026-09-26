import type { PageCursor } from '@shared/lib/api/page-cursor'
import { firstPageParams, nextPagedCursor, type PagedList } from '@shared/lib/api/paged-list'
import type { Post } from '../api/types'

/**
 * Paging for `/bookmarks`, written where every other page-numbered list in this repo writes it.
 *
 * `shared/lib/api/paged-list.ts` holds the rules — the params for the next page and the stop
 * condition — and this file holds the two things that are this list's own: how many rows a page
 * carries, and the row type. Both halves are needed together: the size is the request's `page_size`
 * *and* the number the short-page stop compares against, so a list that changed one and not the
 * other would either stop after one page or ask for its last page forever. Neither throws.
 */

/**
 * Legacy's own (`containers/bookmark/constant`: `PAGE_SIZE = 12`), not the model's `10` default,
 * which nothing calls with.
 *
 * Twelve rather than the twenty most page-numbered lists here use, and deliberately: a bookmark row
 * is a **whole `PostCard`** — media, actions, a Lottie reaction button — where a notification row is
 * a line of text. Twenty of those is a page the reader will not reach the end of before the next
 * one is wanted anyway.
 */
export const BOOKMARKS_PAGE_SIZE = 12

/** The first request's params. `page` is explicit so the fallback cursor can count from it. */
export const BOOKMARKS_FIRST_PAGE: PageCursor = firstPageParams(BOOKMARKS_PAGE_SIZE)

/** A page of bookmarked posts as the endpoint returns it — `PagedList` says what `next` means. */
export type BookmarkPage = PagedList<Post>

/** The params for the next page, or `undefined` when there is none. See `nextPagedCursor`. */
export function nextBookmarksCursor(
    page: BookmarkPage,
    current: PageCursor | null,
): PageCursor | undefined {
    return nextPagedCursor(page, current, BOOKMARKS_PAGE_SIZE)
}
