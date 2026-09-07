'use client'

import { useAuth } from '@features/auth'
import { eventBus } from '@shared/lib/event-bus'
import { useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { forgetMyMembershipsCache, membershipKeys } from '../api/subscription-api'

/**
 * Re-read this feature's queries when a payment settles.
 *
 * ## The bug this exists for
 *
 * A **card** membership is not bought by this feature: the join dialog hands the checkout action to
 * `PaymentProvider` and closes. The provider then owns the outcome — and on settle it invalidates
 * `balanceKeys.all` and emits `payment:succeeded`, which is correct for *its* subject and covers
 * nothing of ours. So the card path left `useChannelMembership` holding a cached "not a member",
 * and the space's action row went on offering **Become a member** to somebody who had just paid,
 * until a reload. The Star path never showed it: that one finishes inside our own mutation, which
 * invalidates on success.
 *
 * The event bus is exactly the right seam here and not a shortcut. `payment` must not import
 * `membership` — the dependency runs the other way (`checkout-order.ts`'s `handoff` exists so it
 * does not have to know) — so the provider announces and whoever cares listens. Same shape as
 * `useRequireStars` announcing a shortfall for the payment sheet to answer.
 *
 * ## Every settle, not only a membership one
 *
 * `payment:succeeded` carries a `purchaseType`, and it is deliberately **not** filtered on: the
 * closed set of that field is an open backend question (see `docs/PAYMENT.md` and B69), so matching
 * it would be guessing at a string. The cost of not filtering is one refetch of a small list after a
 * Star top-up that could not have changed it; the cost of guessing wrong is the bug above, back
 * again and harder to see.
 */
export function useMembershipPaymentSync() {
    const queryClient = useQueryClient()
    const { activeId } = useAuth()

    useEffect(() => {
        const resync = async () => {
            /*
             * The stored validator goes **first, and is awaited**.
             *
             * Invalidating alone was not enough and looked as though it should be: the refetch went
             * out, sent the `If-None-Match` this client still held, and the backend answered 304 —
             * so `apiClient` replayed the cached "not a member" and nothing on screen moved. The
             * ETag had not changed even though the list had, which is invisible from here.
             *
             * Order matters for the same reason: `invalidateQueries` starts the request
             * synchronously, so evicting afterwards would drop the record the request had already
             * read on its way out.
             *
             * Scoped to this moment, not to the endpoint — see `forgetMyMembershipsCache`.
             *
             * `mine`, not the whole feature: a settle changes what this account holds, never the
             * creator's price list, so the space's tiers are not refetched to be told the same
             * prices back.
             */
            await forgetMyMembershipsCache(activeId)
            await queryClient.invalidateQueries({ queryKey: membershipKeys.mine })
        }
        const handle = () => void resync()
        eventBus.on('payment:succeeded', handle)
        return () => eventBus.off('payment:succeeded', handle)
    }, [queryClient, activeId])
}
