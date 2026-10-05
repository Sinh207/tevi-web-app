'use client'

import { useAuth } from '@features/auth'
import { nextPageParam, type PageCursor } from '@shared/lib/api/page-cursor'
import { useInfiniteQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { postApi, postKeys } from '../api/post-api'

/**
 * The answers under one reply.
 *
 * ## It only runs once the reader opens the thread
 *
 * `enabled` is the whole design. A post with thirty replies would otherwise fire thirty requests on
 * arrival for threads nobody has looked at — legacy loads them the same way, behind an *expand*
 * control, and the count on the row is what the reader decides from. So this hook is mounted with
 * `open: false` and costs nothing until a press flips it.
 *
 * Once opened it **stays** fetched: collapsing the thread does not disable the query again, because
 * a reader who closes and reopens one expects it to still be there, and TanStack would otherwise
 * drop it after `gcTime` and refetch from scratch.
 *
 * ## Same shape, same envelope, same account scope as the top-level list
 *
 * A child reply is a `Reply` — `postApi.getChildReplies` parses it with the same schema, and the
 * envelope is the same cursor page with no `count`. The key is its own (`postKeys.childReplies`)
 * because the endpoint is: `v1/posts/replies/{id}/child-replies/`, not the post's `replies/`.
 */
export function useChildReplies(replyId: string, { open }: { open: boolean }) {
    const { activeId } = useAuth()

    const query = useInfiniteQuery({
        queryKey: postKeys.childReplies(replyId, activeId),
        initialPageParam: null as PageCursor | null,
        queryFn: ({ pageParam, signal }) =>
            postApi.getChildReplies({
                replyId,
                cursor: pageParam,
                accountId: activeId,
                signal,
            }),
        getNextPageParam: last => nextPageParam(last.next),
        enabled: open,
    })

    const replies = useMemo(
        () => (query.data?.pages ?? []).flatMap(page => page.results),
        [query.data],
    )

    return {
        replies,
        /** Only while a request could still change the answer — and never before the thread opens. */
        isLoading: open && query.isLoading,
        isError: query.isError,
        refetch: query.refetch,
        fetchNextPage: query.fetchNextPage,
        hasNextPage: query.hasNextPage,
        isFetchingNextPage: query.isFetchingNextPage,
    }
}
