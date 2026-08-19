import { env } from '@shared/config/env'
import { createApiModel } from '@shared/lib/api/model'
import { type ChannelStats, normalizeChannelStats } from './types'

/**
 * Analytics service: `${W_API}/analytics`.
 *
 * A separate `createApiModel` because it is a separate microservice, not a separate path on
 * the channel one — and that separation has a visible consequence. The server render reads the
 * channel from the in-cluster *channel* service, so it cannot pick up stats in the same pass;
 * an anonymous visitor therefore gets the numbers after hydration rather than in the first
 * paint. Whether that can be fixed by fetching stats server-side too depends on whether this
 * endpoint is public, which is B18 — the same question that asks whether `income_usd` is in an
 * anonymous response at all.
 */
const api = createApiModel({ apiBase: `${env.NEXT_PUBLIC_W_API_DOMAIN}/analytics` })

export const channelStatsApi = {
    /** `{ follower_count, member_count, post_count, income_usd }`. */
    async getStats(slug: string, accountId?: string | null): Promise<ChannelStats | null> {
        const body = await api.get<unknown>(
            `v2/channel/${encodeURIComponent(slug)}/stats/`,
            undefined,
            accountId ? { accountId } : undefined,
        )
        return normalizeChannelStats(body)
    },
}
