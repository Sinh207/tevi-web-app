'use client'

import { useAuth } from '@features/auth'
import { useInfiniteQuery } from '@tanstack/react-query'
import { channelApi, channelKeys } from '../api/channel-api'
import { type ChannelActivity, normalizeChannelActivity } from '../api/types'

/**
 * Legacy's page size for this block: a preview on an information tab, not a feed.
 *
 * Exported because the component reserves exactly this many skeleton rows and staggers each batch's
 * entrance modulo it — two places that are wrong the moment they disagree with the request.
 */
export const ACTIVITY_PAGE_SIZE = 4

/**
 * The owner's activity feed — new memberships and donations, four at a time.
 *
 * ## Page numbers, not the `next` cursor
 *
 * This is the **other** pagination style in the same feature, and it is legacy's shape rather than a
 * choice: the thread endpoints hand back a `next` URL, this one takes `page` / `page_size` and reports
 * a `count`. `useInfiniteQuery` covers both — the page param is just a number here — so the difference
 * stays inside this hook instead of leaking into the component.
 *
 * `getNextPageParam` compares **what has been loaded** against `count`, which is why it counts the
 * flattened rows rather than trusting a `next` field that this endpoint does not send. Legacy does the
 * same check (`newActivityFeed.length >= count`) but from inside a `setState` callback, where it also
 * has to hold `page` in a second piece of state and keep the two in step by hand.
 *
 * ## Owner-only, and enforced by the caller
 *
 * The feed names people who paid — members and donors. It is on the owner's About tab in legacy and
 * nowhere else, so `enabled` is the caller's to set and `channel-about-tab.tsx` passes `isOwner`. This
 * hook does not check ownership itself, because it cannot: it has a slug, not a viewer.
 */
export function useChannelActivity({ slug, enabled = true }: { slug: string; enabled?: boolean }) {
    const { activeId } = useAuth()

    const query = useInfiniteQuery({
        queryKey: channelKeys.activity(slug, activeId),
        initialPageParam: 1,
        queryFn: ({ pageParam, signal }) =>
            channelApi.getActivityFeed({
                slug,
                page: pageParam,
                pageSize: ACTIVITY_PAGE_SIZE,
                accountId: activeId,
                signal,
            }),
        getNextPageParam: (last, allPages) => {
            const loaded = allPages.reduce((sum, page) => sum + (page.results?.length ?? 0), 0)
            // `undefined` is what stops TanStack — see `nextPageParam` for the same trap on the
            // cursor lists. A page that came back empty also ends it, whatever `count` claims.
            if (!last.results?.length || loaded >= last.count) return undefined
            return allPages.length + 1
        },
        enabled: enabled && Boolean(slug),
    })

    /** Normalised per page, then flattened — rows with no actor are dropped, not rendered blank. */
    const activities: ChannelActivity[] =
        query.data?.pages.flatMap(page => normalizeChannelActivity(page.results)) ?? []

    return {
        activities,
        isLoading: query.isLoading,
        isError: query.isError,
        hasMore: query.hasNextPage,
        loadMore: query.fetchNextPage,
        isLoadingMore: query.isFetchingNextPage,
    }
}
