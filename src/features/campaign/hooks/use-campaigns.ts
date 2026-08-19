'use client'

import { useAuth } from '@features/auth'
import { useQuery } from '@tanstack/react-query'
import { campaignApi, campaignKeys } from '../api/campaign-api'
import { type CampaignsByType, EMPTY_CAMPAIGNS } from '../api/types'

/**
 * Five minutes. A campaign is a marketing window measured in days, and this renders on every tab
 * destination — refetching it on the cadence the app uses for feed data would be a request per
 * navigation for an answer that changes weekly.
 */
const STALE_TIME = 5 * 60_000

export interface UseCampaigns {
    campaigns: CampaignsByType
    isLoading: boolean
}

/**
 * The rail's three campaigns.
 *
 * ## Why this is a query and not provider state
 *
 * Legacy holds them in `useState` inside `useCampaign`, which `MyChannelProvider` calls and then
 * fetches from a `useEffect` of its own — so server data lives in a provider, one screen's data is
 * fetched by another screen's provider, and keeping it current after a join means patching the
 * state by hand (`updateCampaignAffiliate`). CLAUDE.md's first primitive covers all three: this is
 * server state, so it is TanStack Query, and the affiliate join will invalidate
 * `campaignKeys.list` rather than reach into a setter.
 *
 * ## Signed in only
 *
 * Every campaign here is account-scoped — `user_joined`, eligibility, and in legacy the fetch is
 * gated behind `myChannel?.id` existing. `enabled` keeps a visitor with no account from making a
 * request that can only answer "nothing for you". `isLoading` is reported as `false` in that case
 * rather than the `true` a disabled query would otherwise report forever, which is exactly the
 * stuck-skeleton bug legacy's Lives tab has.
 */
export function useCampaigns(): UseCampaigns {
    const { activeId, isAuthenticated } = useAuth()

    const query = useQuery({
        queryKey: campaignKeys.list(activeId),
        queryFn: ({ signal }) => campaignApi.getCampaigns({ accountId: activeId, signal }),
        enabled: isAuthenticated,
        staleTime: STALE_TIME,
    })

    return {
        campaigns: query.data ?? EMPTY_CAMPAIGNS,
        isLoading: isAuthenticated && query.isLoading,
    }
}
