'use client'

import { useAuth } from '@features/auth'
import { useInfiniteQuery } from '@tanstack/react-query'
import { EVENTS_PAGE_SIZE, eventKeys, eventsApi } from '../api/events-api'

/**
 * The creator's live events, twelve at a time.
 *
 * ## Page numbers, and a paging bug not carried over
 *
 * Same `page` / `page_size` / `count` shape as the activity feed, so `getNextPageParam` counts the
 * rows it already has against `count` rather than trusting a `next` field this endpoint does not
 * send.
 *
 * Legacy computes it as `hasMore = totalCount > PAGE_SIZE` — evaluated fresh on **every** fetch and
 * never against what has been loaded. So a creator with 30 events gets `13 > 12 = true` forever and
 * the list keeps requesting page 4, 5, 6 of an exhausted endpoint; a creator with exactly 12 gets
 * `false` on the first load, which is correct by accident. Counting loaded rows is the fix, and it is
 * the same three lines `use-channel-activity.ts` already uses.
 *
 * `undefined` is what stops TanStack. `null` is a valid page param, so returning it would leave
 * `hasNextPage` true forever and let the sentinel hammer the endpoint.
 */
export function useChannelEvents({
    /** `''` is legacy's "All". Part of the query key, so switching filters is a separate list. */
    state = '',
    enabled = true,
}: {
    state?: string
    enabled?: boolean
} = {}) {
    const { activeId } = useAuth()

    const query = useInfiniteQuery({
        queryKey: eventKeys.list(activeId, state),
        initialPageParam: 1,
        queryFn: ({ pageParam, signal }) =>
            eventsApi.getEvents({ page: pageParam, state, accountId: activeId, signal }),
        getNextPageParam: (last, allPages) => {
            const loaded = allPages.reduce((sum, page) => sum + page.results.length, 0)
            // An empty page ends the list whatever `count` claims — the two disagree when an event
            // is cancelled between requests, and the count is the one that goes stale.
            if (!last.results.length || loaded >= last.count) return undefined
            return allPages.length + 1
        },
        enabled,
    })

    return {
        events: query.data?.pages.flatMap(page => page.results) ?? [],
        /** The server's total, for the heading. `0` until the first page lands. */
        total: query.data?.pages[0]?.count ?? 0,
        isLoading: query.isLoading,
        isError: query.isError,
        refetch: query.refetch,
        hasNextPage: query.hasNextPage,
        fetchNextPage: query.fetchNextPage,
        isFetchingNextPage: query.isFetchingNextPage,
        pageSize: EVENTS_PAGE_SIZE,
    }
}
