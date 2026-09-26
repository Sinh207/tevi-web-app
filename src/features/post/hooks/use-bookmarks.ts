'use client'

import { useAuth } from '@features/auth'
import { useTranslation } from '@shared/i18n/use-translation'
import type { PageCursor } from '@shared/lib/api/page-cursor'
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useMemo } from 'react'
import { toast } from 'sonner'
import { postApi, postKeys } from '../api/post-api'
import type { Post } from '../api/types'
import { BOOKMARKS_FIRST_PAGE, nextBookmarksCursor } from '../lib/bookmark-page'

/**
 * Every page of what the reader has bookmarked, and the one action the screen offers.
 *
 * ## The list is a query; the card still owns the toggle
 *
 * `usePostBookmark` already bookmarks and unbookmarks from a card, and this deliberately does not
 * duplicate it: the screen renders `PostCard`s, so the toggle on each one is the card's own. What
 * this adds is the **invalidation** — a row unbookmarked here has to leave the list, and the card
 * cannot know it is in one. `onChanged` on the card is the hook that fires it.
 *
 * `post-api.ts`'s header notes legacy raises `BOOKMARK_ADD` / `BOOKMARK_REMOVE` on a bus for
 * exactly this, and that it was left out on the grounds that the list, when it existed, would be a
 * query plus an invalidation. This is that.
 *
 * ## `enabled` on the session, not on the route
 *
 * A guest has no bookmarks and the endpoint would answer 401. The screen still renders — it says
 * what the list is and offers a way in — which is this repo's rule: gate the **action**, never the
 * route.
 */
export interface UseBookmarksResult {
    posts: Post[]
    /** What the server says it holds, which may exceed what has been fetched. */
    total: number
    isLoading: boolean
    isError: boolean
    /** Loaded, no failure, and nothing in it — the empty state, not the loading one. */
    isEmpty: boolean
    isSignedOut: boolean
    refetch: () => void
    hasNextPage: boolean
    isFetchingNextPage: boolean
    loadMore: () => void
    /** Drop every bookmark. Resolves once the list has been refetched. */
    clearAll: () => void
    isClearing: boolean
}

export function useBookmarks(): UseBookmarksResult {
    const { activeId, isAuthenticated } = useAuth()
    const { t } = useTranslation()
    const queryClient = useQueryClient()

    /*
     * Memoised on the account, for `use-inbox.ts`'s reason: the key is a fresh array every render,
     * and the mutation below closes over it.
     */
    const queryKey = useMemo(() => postKeys.bookmarks(activeId), [activeId])

    const query = useInfiniteQuery({
        queryKey,
        initialPageParam: BOOKMARKS_FIRST_PAGE as PageCursor | null,
        queryFn: ({ pageParam, signal }) =>
            postApi.getBookmarks({
                params: pageParam ?? BOOKMARKS_FIRST_PAGE,
                accountId: activeId,
                signal,
            }),
        getNextPageParam: (last, _pages, lastParam) => nextBookmarksCursor(last, lastParam),
        enabled: isAuthenticated,
    })

    const posts = useMemo(() => query.data?.pages.flatMap(page => page.results) ?? [], [query.data])

    const clear = useMutation({
        mutationFn: () => postApi.clearBookmarks(activeId),
        onSuccess: landed => {
            /*
             * `false` is a write that did not land — the same reading `addBookmark` and
             * `removeBookmark` take of this endpoint family (**B106**). Refetching on it would
             * redraw the list it failed to empty and say nothing.
             */
            if (!landed) {
                toast.error(t('bookmarks_clear_failed'))
                return
            }
            toast.success(t('bookmarks_cleared'))
            void queryClient.invalidateQueries({ queryKey })
        },
        onError: () => toast.error(t('bookmarks_clear_failed')),
    })

    return {
        posts,
        total: query.data?.pages[0]?.count ?? 0,
        isLoading: query.isLoading,
        isError: query.isError,
        isEmpty: !query.isLoading && !query.isError && posts.length === 0,
        isSignedOut: !isAuthenticated,
        refetch: () => void query.refetch(),
        hasNextPage: query.hasNextPage,
        isFetchingNextPage: query.isFetchingNextPage,
        loadMore: () => {
            if (query.hasNextPage && !query.isFetchingNextPage) void query.fetchNextPage()
        },
        clearAll: () => clear.mutate(),
        isClearing: clear.isPending,
    }
}
