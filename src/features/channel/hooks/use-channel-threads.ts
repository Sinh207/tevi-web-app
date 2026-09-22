'use client'

import { useAuth } from '@features/auth'
import type { Post } from '@features/post'
import { nextPageParam, type PageCursor } from '@shared/lib/api/page-cursor'
import { useInfiniteQuery } from '@tanstack/react-query'
import { channelApi, channelKeys, type ThreadKind } from '../api/channel-api'

/**
 * A channel's posts or media, paginated over the `next` cursor.
 *
 * Paginated from day one even though the card is a placeholder, because DoD §6 asks for it and
 * because retrofitting pagination onto a list that renders an unbounded array means rewriting the
 * component rather than swapping the card.
 *
 * The cursor is a **full URL** the client must not fetch — `paramsFromNextUrl` explains why (an
 * internal hostname, and the credential rules in `origins.ts`). `nextPageParam` wraps the one detail
 * that is easy to get wrong: **`undefined` stops TanStack Query and `null` does not**, so returning
 * `null` on the last page would leave `hasNextPage` true forever and let the intersection sentinel
 * re-fire against a list with nothing left in it.
 */
export function useChannelThreads({
    slug,
    kind,
    isOwner,
    enabled = true,
}: {
    slug: string
    kind: ThreadKind
    isOwner: boolean
    enabled?: boolean
}) {
    const { activeId } = useAuth()

    const query = useInfiniteQuery({
        queryKey: channelKeys.threads(slug, kind, activeId),
        initialPageParam: null as PageCursor | null,
        queryFn: ({ pageParam, signal }) =>
            channelApi.getThreads({
                slug,
                isOwner,
                kind,
                cursor: pageParam,
                accountId: activeId,
                signal,
            }),
        getNextPageParam: last => nextPageParam(last.next),
        enabled: enabled && Boolean(slug),
    })

    /**
     * Flattened here rather than at the call site, so the list component never sees the page
     * structure and cannot accidentally render `pages[0]` only.
     */
    const threads: Post[] = query.data?.pages.flatMap(page => page.results) ?? []

    return {
        threads,
        /** From the first page's envelope — the total, not the number loaded so far. */
        total: query.data?.pages[0]?.count ?? 0,
        isLoading: query.isLoading,
        isError: query.isError,
        refetch: query.refetch,
        fetchNextPage: query.fetchNextPage,
        hasNextPage: query.hasNextPage,
        isFetchingNextPage: query.isFetchingNextPage,
        /**
         * `true` only once the first page has come back **and** held nothing. Distinct from
         * `isLoading`: an empty state shown while a request is still in flight tells the reader
         * there is nothing here when nobody knows that yet.
         */
        isEmpty: !query.isLoading && !query.isError && threads.length === 0,
    }
}
