'use client'

import { useAuth } from '@features/auth'
import { useQuery } from '@tanstack/react-query'
import { channelKeys } from '../api/channel-api'
import { channelStatsApi } from '../api/channel-stats-api'
import type { ChannelStats } from '../api/types'

/**
 * Follower / member / post counts, and the owner's income.
 *
 * A separate query from `useChannel` because it is a separate microservice
 * (`${W_API}/analytics`), and that has a visible consequence: the server render reads the channel
 * from the in-cluster *channel* service and cannot pick these up in the same pass, so the strip
 * arrives after hydration. The header therefore reserves the row at its final height — see the
 * skeleton — rather than letting four numbers appear and push the page down.
 *
 * Whether that can be avoided by fetching stats server-side too depends on whether the endpoint
 * is public, which is B18 — the same question that asks whether `income_usd` reaches an anonymous
 * caller at all. Until it is answered, the client renders income only for the owner *and* only
 * when `show_income` is set, but that is a display rule sitting on top of an access rule the
 * backend owns.
 */
export function useChannelStats(slug: string, { enabled = true }: { enabled?: boolean } = {}) {
    const { activeId } = useAuth()

    const query = useQuery({
        queryKey: channelKeys.stats(slug, activeId),
        queryFn: () => channelStatsApi.getStats(slug, activeId),
        // Terminal states (suspended, blocked, unpublished to a stranger) render no stats at all,
        // so the caller turns this off rather than fetching numbers nothing will show.
        enabled: enabled && Boolean(slug),
    })

    return {
        stats: query.data as ChannelStats | null | undefined,
        isLoading: query.isLoading,
        isError: query.isError,
    }
}
