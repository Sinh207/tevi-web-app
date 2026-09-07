'use client'

import { useAuth } from '@features/auth'
import { useQuery } from '@tanstack/react-query'
import { membershipApi, membershipKeys } from '../../api/subscription-api'
import { useMembershipPaymentSync } from '../use-membership-payment-sync'

/**
 * Whether this account already holds an **active** membership to one space.
 *
 * What decides between "Become a member" and "Activated membership" on the space's action row, and
 * the reason it is one narrow question rather than a filter on the `/my-membership` list: that
 * query's key carries the screen's tab, its payment-method filter and its debounced search term, so
 * reusing it would mint a cache entry per keystroke somebody typed on a completely different screen —
 * and would refetch this button every time they typed.
 *
 * ## `status: 'active'` is the whole question
 *
 * A **cancelled** membership is still active until its term runs out (`canceled_at` is set, the row
 * is not expired — see `membershipSchema`), and that reader *is* a member: they should see the
 * activated state, not an invitation to buy what they already have. An **expired** one is not, and
 * they should see the invitation. So the server-side filter answers it exactly, and nothing here
 * re-derives it from dates.
 *
 * Anonymous accounts are not asked. Every visitor carries an anonymous session, so without the gate
 * this would be a request per space page for a list that is empty by construction — the same
 * reasoning `BalanceProvider` and `MyChannelProvider` both give.
 */
export function useChannelMembership(channelId: string | null | undefined) {
    const { activeId, isAuthenticated } = useAuth()
    const id = channelId ?? ''

    /*
     * A card membership settles outside this feature, so nothing here would know. See the hook —
     * without it the action row keeps offering "Become a member" to somebody who has just paid.
     */
    useMembershipPaymentSync()

    const query = useQuery({
        queryKey: membershipKeys.channelMembership(activeId, id),
        queryFn: ({ signal }) =>
            membershipApi.getMyMemberships({
                page: 1,
                status: 'active',
                channelId: id,
                accountId: activeId,
                signal,
            }),
        enabled: isAuthenticated && Boolean(id),
    })

    return {
        /** The membership itself, so the activated state can name the tier. */
        membership: query.data?.results[0] ?? null,
        isMember: (query.data?.results.length ?? 0) > 0,
        /** `isLoading`, not `isPending`: a disabled query is pending forever and is not loading. */
        isLoading: query.isLoading,
    }
}
