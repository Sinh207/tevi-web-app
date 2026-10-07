'use client'

import { useAuth } from '@features/auth'
import type { Post } from '@features/post'
import { useQuery } from '@tanstack/react-query'
import { channelApi, channelKeys } from '../api/channel-api'

/**
 * The space's pinned post, drawn above the Posts tab — the request `useChannelThreads` deliberately
 * leaves out (`pinned: 0`). Account-scoped like every thread read: a pinned post is as
 * viewer-relative as any other (locked, purchased, reacted).
 *
 * A failure is **not** surfaced: the list below has its own error state, and a pinned post that
 * could not be fetched is a heading short, not a broken tab.
 */
export function usePinnedThreads({
    slug,
    isOwner,
    enabled = true,
}: {
    slug: string
    isOwner: boolean
    enabled?: boolean
}) {
    const { activeId } = useAuth()

    const query = useQuery({
        queryKey: channelKeys.pinnedThreads(slug, activeId),
        queryFn: ({ signal }) =>
            channelApi.getPinnedThreads({ slug, isOwner, accountId: activeId, signal }),
        enabled: enabled && Boolean(slug),
    })

    const pinned: Post[] = query.data ?? []
    return { pinned, isLoading: query.isLoading, refetch: query.refetch }
}
