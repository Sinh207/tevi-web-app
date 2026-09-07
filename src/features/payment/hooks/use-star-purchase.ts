'use client'

import { useCallback, useEffect, useState } from 'react'
import type { CheckoutState } from '../lib/checkout-machine'
import { type StarCatalogue, useStarCatalogue } from './use-star-catalogue'

/**
 * Machine states another dialog puts on screen. While the machine is in one of these, the sheet must
 * not also be open — see the effect that reads this.
 *
 * `card` and `confirming` belong to `CardCheckoutDialog`; the four after them to
 * `CheckoutStatusDialog`. The card form used to be a step *inside* this sheet, which broke the moment a
 * second surface needed one — see that dialog's note.
 */
const HANDED_OVER_STATES = new Set([
    'card',
    'confirming',
    'settling',
    'slow',
    'succeeded',
    'failed',
])

/** Packages → Order summary → the gateway's own step. And closed. */
export type StarPurchaseStep = 'closed' | 'packages' | 'summary' | 'payment'

export interface StarPurchaseFlow extends StarCatalogue {
    step: StarPurchaseStep
    /** Star the reader was short of when the sheet was opened this way, else `0`. */
    shortfall: number
    /** Open on the package grid. `shortfall` pre-selects a package that closes the gap. */
    open: (shortfall?: number) => void
    review: () => void
    back: () => void
    close: () => void
    /** Hand the order to the checkout machine. */
    pay: () => void
}

/**
 * The Star purchase **sheet**'s own state — which of the three steps, over the selection every Star
 * surface shares (`useStarCatalogue`).
 *
 * ## What it is not
 *
 * It is **not** the checkout. The moment the reader presses Pay, `PaymentProvider`'s machine owns what
 * happens (`useCheckout`), and this sheet's only remaining job is to get out of the way. That split is
 * why a settle can outlive the sheet, why a 3DS redirect can come back to a page where the sheet never
 * existed, and why closing the sheet cannot cancel a charge — all three are properties of the machine
 * living above it. Legacy keeps the poll inside the dialog and loses the payment when the dialog goes.
 *
 * ## Sheet or page — this is the sheet, and the difference is who asked
 *
 * `/get-star` (`useGetStar`) is the same purchase reached **deliberately**: a menu row, the `+` in the
 * top bar, *Get more* after a settle. The sheet is the purchase reached **by being stopped** — a gift
 * pressed with too little Star — and it stays a sheet for the reason `docs/DEFINITION_OF_DONE.md` §3
 * gives: the livestream someone was watching when they pressed the gift is still there behind it.
 * Navigating them to a page would close it.
 *
 * Both hold one `useStarCatalogue`, so the shortfall rule, the total and the gateway band are decided
 * in one place and cannot drift apart.
 *
 * ## Pre-selection is the point of the shortfall
 *
 * Opened from `useRequireStars`, the sheet knows exactly how much is missing, and
 * `pickPackageForShortfall` starts on the cheapest package that covers it — bonus included, so nobody
 * is nudged into a bigger tier than they need. Opened deliberately, there is no gap to close and the
 * recommended tile is the honest default.
 */
export function useStarPurchase(checkoutState: CheckoutState): StarPurchaseFlow {
    const [step, setStep] = useState<StarPurchaseStep>('closed')
    const [shortfall, setShortfall] = useState(0)

    const isOpen = step !== 'closed'
    const catalogue = useStarCatalogue({ enabled: isOpen, shortfall })
    const { reseed } = catalogue

    /*
     * The sheet steps aside exactly when the **status dialog** takes over, and the rule is written as
     * that list rather than as "anything else": two layers of chrome stacked on each other is the bug,
     * and an inverted check made `idle` close the sheet — which is every moment before `checkout/`
     * answers and every moment after the reader dismisses the status dialog.
     *
     * `leaving` is deliberately **not** in the list: no other dialog renders for it, so closing would
     * leave a blank screen while the browser navigates to the gateway. The sheet keeps its
     * "taking you to …" line until the page goes.
     *
     * It steps aside here rather than at each call site because every path out of `payment` — confirm,
     * decline, transport failure, dismissal — has to do it.
     */
    useEffect(() => {
        if (step !== 'payment') return
        if (!HANDED_OVER_STATES.has(checkoutState.kind)) return
        setStep('closed')
    }, [step, checkoutState.kind])

    const close = useCallback(() => setStep('closed'), [])

    const open = useCallback(
        (gap = 0) => {
            setShortfall(Number.isFinite(gap) && gap > 0 ? gap : 0)
            /*
             * Explicitly, even though closing already released the seed: re-opening from a state the
             * sheet never left (the status dialog closed and the reader pressed *Get more*) has to land
             * on the new shortfall's package rather than on the last purchase's.
             */
            reseed()
            setStep('packages')
        },
        [reseed],
    )

    return {
        ...catalogue,
        step,
        shortfall,
        open,
        review: useCallback(() => setStep('summary'), []),
        back: useCallback(() => setStep('packages'), []),
        close,
        pay: useCallback(() => setStep('payment'), []),
    }
}
