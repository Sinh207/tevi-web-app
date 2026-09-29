import type { PageCursor } from '@shared/lib/api/page-cursor'
import { firstPageParams, nextPagedCursor, type PagedList } from '@shared/lib/api/paged-list'
import type { Post } from '../api/types'

/**
 * Paging for a collection's posts.
 *
 * Separate from `COLLECTIONS_PAGE_SIZE` (the list of collections, in `api/post-api.ts`) because
 * they page different things: ten collection **rows** is a screenful of names, and ten whole
 * `PostCard`s is something else entirely. Sharing one constant would mean a change made for one
 * screen silently reshaping the other.
 *
 * `shared/lib/api/paged-list.ts` holds the rules; this holds the size and the row type, and the two
 * have to agree — the size is the request's `page_size` *and* the number the short-page stop
 * compares against, so changing one alone makes the list stop after one page or ask for its last
 * page forever. Neither throws.
 */

/** Legacy's own (`getPostByCollection(id, page = 1, page_size = 10)`). */
export const COLLECTION_POSTS_PAGE_SIZE = 10

/** The first request's params. `page` is explicit so the fallback cursor can count from it. */
export const COLLECTION_POSTS_FIRST_PAGE: PageCursor = firstPageParams(COLLECTION_POSTS_PAGE_SIZE)

/** A page of a collection's posts — `PagedList` says what `next` means. */
export type CollectionPostPage = PagedList<Post>

/** The params for the next page, or `undefined` when there is none. See `nextPagedCursor`. */
export function nextCollectionPostsCursor(
    page: CollectionPostPage,
    current: PageCursor | null,
): PageCursor | undefined {
    return nextPagedCursor(page, current, COLLECTION_POSTS_PAGE_SIZE)
}

/**
 * How many collections an account may have — legacy's `collections.length < 10`, which hides the
 * create control on the list and in the composer's picker alike. Whether the backend enforces it
 * too is not known; the client keeps the number both shipped screens keep.
 */
export const COLLECTIONS_MAX = 10
