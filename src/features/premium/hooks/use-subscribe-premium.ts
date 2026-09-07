'use client'

import { useRequireAuth } from '@features/auth'
import { DEFAULT_GATEWAY_ID, usePayment } from '@features/payment'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { PremiumPackage } from '../api/types'
import { type PremiumPlan, planOf } from '../lib/plans'

export interface SubscribePremiumFlow {
    /** The package awaiting confirmation, or `null` when no dialog is up. */
    pending: PremiumPackage | null
    /** Which card raised the dialog — decides the plan's name in the confirmation sentence. */
    pendingPlan: PremiumPlan | null
    /** The checkout is in flight or the browser is leaving. Both buttons must be inert. */
    isBusy: boolean
    /** A Subscribe button was pressed. Gated: a guest gets the sign-in dialog instead. */
    request: (pkg: PremiumPackage) => void
    /** "Yes, I confirm" — starts the checkout. */
    confirm: () => void
    /** Dismiss without buying. Refused while busy. */
    cancel: () => void
}

/**
 * Pressing Subscribe: a confirmation, then a checkout somebody else owns.
 *
 * ## Two steps, because the purchase is non-refundable
 *
 * Legacy interposes a confirm dialog between the card and the charge, and its sentence says so
 * ("Please note this purchase is non-refundable"). Kept, verbatim in intent: a subscription is the
 * one purchase on this screen and it is a recurring one, so the second press is the point.
 *
 * ## The gate is on the press, never on the route
 *
 * `useRequireAuth` wraps `request`, so a visitor reading the price list gets the sign-in dialog
 * instead of a charge, and stays exactly where they were. That is `docs/DEFINITION_OF_DONE.md` §3
 * and it is why the queries behind this screen are enabled for a guest at all — see
 * `usePremiumPlans`. Legacy gates the *data*, which leaves an anonymous visitor on an empty page
 * with nothing to sign in *for*.
 *
 * ## This hook does not take the money, and must not
 *
 * `usePayment().checkout` does. A Premium order is `{ kind: 'premium', priceId }` — the request
 * body, the gateway, the return URLs, the timezone, the `REDIRECT` branch and the account pinned at
 * the press all belong to `features/payment`, which already has every one of them
 * (`lib/checkout-order.ts`). What this feature knows and that one does not is **which package**, and
 * that `product_id` is where the price id lives.
 *
 * `savePaymentInfo` is deliberately `false`, as legacy sends it: a hosted Stripe Checkout collects
 * and stores the card itself under the customer, so asking the backend to also save it here would be
 * a second copy of the same consent, taken on a page that never showed a card field.
 *
 * ## The dialog steps aside when another one takes over
 *
 * Exactly the rule `useStarPurchase` writes down, and the list is the same: `card` and `confirming`
 * belong to `CardCheckoutDialog`, the four after them to `CheckoutStatusDialog`. `leaving` is
 * **not** in the list — no other dialog renders for it, so closing would leave a blank page while
 * the browser navigates to Stripe. The confirmation keeps its pending state until the page goes.
 */
const HANDED_OVER_STATES = new Set([
    'card',
    'confirming',
    'settling',
    'slow',
    'succeeded',
    'failed',
])

export function useSubscribePremium(): SubscribePremiumFlow {
    const { checkout, state, isBusy } = usePayment()
    const requireAuth = useRequireAuth()
    const [pending, setPending] = useState<PremiumPackage | null>(null)
    /**
     * Whether *this* dialog's confirm started the checkout that is running.
     *
     * Needed because `idle` is two different situations: the machine before anything was pressed —
     * which is when the dialog is *supposed* to be open, waiting for a second press — and the
     * machine after a checkout was abandoned. Without the ref the rule below would close the dialog
     * in the frame it opened.
     */
    const startedRef = useRef(false)

    useEffect(() => {
        if (!pending) return
        if (HANDED_OVER_STATES.has(state.kind)) {
            startedRef.current = false
            setPending(null)
            return
        }
        /*
         * **The reader pressed Back at Stripe.**
         *
         * `useCheckout` resets the machine out of `leaving` when the page is restored from the
         * back-forward cache (its own note has the measurement). That alone un-disables these two
         * buttons — the bug was that nothing could close the dialog — but leaving it *open* is still
         * wrong: the reader has been to the checkout page and come back, so the question "purchase
         * Tevi Premium?" has already been answered, one way or the other. It goes.
         *
         * A restore is the only way to get here: `idle` after a confirm means something reset the
         * machine, and nothing else on this screen does.
         */
        if (startedRef.current && state.kind === 'idle') {
            startedRef.current = false
            setPending(null)
        }
    }, [pending, state.kind])

    /*
     * Wrapped in `useCallback` on the wrapper, which is the idiom `useRequireStars` uses: the
     * identity has to be stable, because three plan cards take it as a prop and one of them is
     * memo-shaped around a price that does not change.
     */
    const request = useCallback(
        (pkg: PremiumPackage) =>
            requireAuth(() => {
                /*
                 * A second press while a checkout is live is dropped here as well as in the machine.
                 * `useCheckout.start` guards the *request*; this guards the **dialog**, which would
                 * otherwise re-open on the package pressed second and confirm a charge for the first.
                 */
                if (isBusy) return
                setPending(pkg)
            })(),
        [requireAuth, isBusy],
    )

    const confirm = useCallback(() => {
        if (!pending || isBusy) return
        /*
         * `normalizePremiumPackages` drops a row with no `product_id`, so this cannot be reached
         * from the screen — and it is checked anyway rather than coerced with `?? ''`, because the
         * failure of an empty `price_id` is a 4xx from `checkout/` that reads as a payment problem.
         */
        const priceId = pending.product_id
        if (!priceId) return
        startedRef.current = true
        checkout({
            kind: 'premium',
            gatewayId: DEFAULT_GATEWAY_ID,
            priceId,
            savePaymentInfo: false,
        })
    }, [checkout, isBusy, pending])

    const cancel = useCallback(() => {
        if (isBusy) return
        startedRef.current = false
        setPending(null)
    }, [isBusy])

    return {
        pending,
        pendingPlan: pending ? planOf(pending) : null,
        isBusy,
        request,
        confirm,
        cancel,
    }
}
