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
 * ## ⚠ There is no `count`, and this hook used to invent one
 *
 * The envelope is `{ next, previous, results }` — cursor pagination, measured against the real
 * service. This hook read `count ?? 0` off it and handed the heading a **zero on every post that
 * had replies**, which nothing caught because zero is also the honest answer for a post with none.
 * The number beside the heading is the parent post's own `reply_count` now, which the screen
 * already holds.
 *
 * ## The rows are `Reply`, not `Post`
 *
 * They were parsed as posts, and `api/reply-types.ts` carries the measured table of how far apart
 * the two payloads are — the short version being that a reply's author is `owner_channel`, so every
 * row rendered with no author at all.
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
