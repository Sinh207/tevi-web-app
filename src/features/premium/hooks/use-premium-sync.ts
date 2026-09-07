'use client'

import { useAuth } from '@features/auth'
import { useSocketEvent } from '@features/realtime'
import { eventBus } from '@shared/lib/event-bus'
import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect } from 'react'
import { forgetPremiumInfoCache, premiumKeys } from '../api/premium-api'

/**
 * Re-read this account's grant when it changes — from **either** of the two things that can tell us.
 *
 * ## Two signals, because a Premium purchase does not finish on this page
 *
 * Buying Premium is a **hosted redirect**: the browser leaves for Stripe's page and comes back to
 * `/premium` as a fresh document, with no client secret and no `payment_intent` on the URL — so
 * `useCheckoutCallback` finds nothing to resume and `payment:succeeded` never fires for this path.
 * What actually confirms the purchase is the backend's webhook, and what tells *us* is the
 * `premium_info` socket frame. `MyChannelProvider` already listens to it for `isPremium`; this adds
 * the expiry date, which is the other half of the same news.
 *
 * The event-bus half covers the other shape the same purchase can take. `parseCheckoutAction` is a
 * union of four and the backend decides which branch a Premium checkout answers with — a `STRIPE`
 * action would settle **in place**, through `PaymentProvider`, which emits `payment:succeeded` and
 * knows nothing about Premium (it must not: `payment` may not import this feature, which is exactly
 * why the bus is the seam — the same shape as `useMembershipPaymentSync`). Listening to both means
 * neither branch leaves a stale date on screen, and the cost of the overlap is one refetch.
 *
 * `purchaseType` is deliberately **not** filtered on: the closed set of that field is an open
 * backend question (B69), so matching it would be guessing at a string. The cost of not filtering is
 * a refetch of one small body after a Star top-up that could not have changed it; the cost of
 * guessing wrong is a wrong date on a receipt.
 *
 * ## The eviction is not optional — see `forgetPremiumInfoCache`
 *
 * `invalidateQueries` alone sends a conditional GET, and a `304` replays the very body this is
 * trying to replace. The stored validator goes **first, and is awaited**, because
 * `invalidateQueries` starts the request synchronously: evicting afterwards would drop the record
 * the request had already read on its way out.
 */
export function usePremiumSync() {
    const queryClient = useQueryClient()
    const { activeId } = useAuth()

    const resync = useCallback(async () => {
        await forgetPremiumInfoCache(activeId)
        /*
         * `info`, not `premiumKeys.all`: a grant landing changes what this account holds, never the
         * catalogue or the benefits list — refetching those would ask the backoffice's price table
         * to confirm itself after every purchase.
         */
        await queryClient.invalidateQueries({ queryKey: premiumKeys.info(activeId) })
    }, [queryClient, activeId])

    /*
     * The frame's payload is ignored, for the reason `BalanceProvider` and `MyChannelProvider` both
     * state about their own: **a socket event is a signal, never a source.** A frame has no ordering
     * guarantee against the HTTP responses beside it, so writing its `IsPremium` into the cache can
     * move a figure backwards. The re-read is the source.
     */
    useSocketEvent('premium_info', () => {
        void resync()
    })

    useEffect(() => {
        const handle = () => void resync()
        eventBus.on('payment:succeeded', handle)
        return () => eventBus.off('payment:succeeded', handle)
    }, [resync])
}
