'use client'

import { useAuth } from '@features/auth'
import { useQuery } from '@tanstack/react-query'
import { membershipApi, membershipKeys } from '../../api/subscription-api'
import { firstJoinable } from '../../lib/join-offer'

/**
 * The tiers a space offers, resolved down to the one its action row can sell.
 *
 * Public information, so it is asked for anonymous visitors too — a guest should see that a space
 * has a membership before being asked to sign in for it, which is the opposite of the balance and
 * the "am I a member" query beside it.
 *
 * `offer` is `null` for a space with no tiers **and** for one whose tiers are all cash-only. Both
 * mean "no button here", and collapsing them is deliberate: the difference matters to
 * `docs/PAYMENT.md`, not to the reader (`lib/join-offer.ts`).
 */
export function useChannelPackages(slug: string, { enabled = true }: { enabled?: boolean } = {}) {
    const { activeId } = useAuth()

    const query = useQuery({
        queryKey: membershipKeys.channelPackages(activeId, slug),
        queryFn: ({ signal }) =>
            membershipApi.getChannelPackages({ slug, accountId: activeId, signal }),
        enabled: enabled && Boolean(slug),
    })

    const packages = query.data ?? []

    return {
        packages,
        offer: firstJoinable(packages),
        isLoading: query.isLoading,
    }
}
