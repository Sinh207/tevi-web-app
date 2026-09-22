'use client'

import { useAuth } from '@features/auth'
import { nextPageParam, type PageCursor } from '@shared/lib/api/page-cursor'
import { useInfiniteQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { postApi, postKeys } from '../api/post-api'

/**
 * The replies under one post.
 *
 * ## Account-scoped, like everything else this feature caches
 *
 * `postKeys.replies` carries the active account, and it has to: a reply is a post, so every row is
 * viewer-relative in the same nine fields the parent is. A key shared across accounts would show
 * one reader another's unlock state on a paid reply.
 *
 * ## `count` comes from the server and is **not** `rows.length`
 *
 * The parent's `reply_count` and this list's `count` can disagree for a moment — the parent is a
 * cached body and this is a fresh page — and the number beside the heading should be the one that
 * came with the rows it labels. Rows already loaded is a third number again and is never what a
 * reader means by "42 replies".
 */
export function usePostReplies(postId: string | null) {
    const { activeId } = useAuth()

    const query = useInfiniteQuery({
        queryKey: postKeys.replies(postId ?? '', activeId),
        initialPageParam: null as PageCursor | null,
        queryFn: ({ pageParam, signal }) =>
            postApi.getReplies({
                postId: postId ?? '',
                cursor: pageParam,
                accountId: activeId,
                signal,
            }),
        getNextPageParam: last => nextPageParam(last.next),
        // No post, no replies to ask for — the detail page renders before its own fetch resolves.
        enabled: Boolean(postId),
    })

    const replies = useMemo(
        () => (query.data?.pages ?? []).flatMap(page => page.results),
        [query.data],
    )

    return {
        replies,
        /** The server's own total, from the most recent page — see the note above. */
        count: query.data?.pages[query.data.pages.length - 1]?.count ?? 0,
        isLoading: query.isLoading,
        isError: query.isError,
        refetch: query.refetch,
        fetchNextPage: query.fetchNextPage,
        hasNextPage: query.hasNextPage,
        isFetchingNextPage: query.isFetchingNextPage,
        /**
         * `true` only once a page has come back holding nothing — distinct from `isLoading`, which
         * is the same rule `useHomeFeed.isEmpty` states: an empty state shown while a request is in
         * flight tells the reader there is nothing here when nobody knows that yet.
         */
        isEmpty: !query.isLoading && !query.isError && replies.length === 0,
    }
}
