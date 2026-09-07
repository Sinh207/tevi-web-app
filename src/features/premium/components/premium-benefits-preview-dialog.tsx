'use client'

import { useEffect } from 'react'
import { usePremiumBenefits } from '../hooks/use-premium-benefits'
import { PremiumBenefitDialog } from './premium-benefit-dialog'

/**
 * **What Premium unlocks, as a carousel with nothing to buy in it** — the benefits dialog for a
 * screen that is not `/premium`.
 *
 * ## Why this wrapper exists rather than a second barrel export
 *
 * `/gift-premium`'s "See features" button asks the same question `/premium`'s benefit rows do, and
 * it must get the same answer: the same list, the same carousel, the same copy localiser. The parts
 * that produce it — `usePremiumBenefits` and `PremiumBenefitDialog` — are internal to this feature
 * and stay internal, because a consumer given the query and the dialog separately is a consumer who
 * can wire them together slightly differently. Exporting **one component that is already correct**
 * is the call `features/auth` makes about `TwoStepVerificationDialog` and for the same stated reason:
 * so no caller can assemble a shabbier version from the pieces.
 *
 * ## `subscribe` is `null`, and that is the whole difference
 *
 * The dialog's footer button subscribes *the reader*. On the gift screen that is the wrong purchase
 * — somebody reading what Premium includes so they can buy it for a creator must not be sold a
 * subscription for themselves by the same press. `PremiumBenefitDialog` already renders no button
 * for `null` (its member state), so the dots simply sit in the bar on their own. Legacy passes
 * `hiddenBntSub` for exactly this.
 *
 * ## It renders nothing until it has something to render
 *
 * A carousel with no slides is a dialog the reader has to dismiss to find out it was empty. While
 * the benefits are in flight this renders nothing; once they have **settled empty** — a failed
 * request, or a catalogue between edits — `onClose` puts the caller's own "is it open" state back,
 * which is what turns that into "the button did nothing" rather than "the button is now permanently
 * pressed and the screen is blank".
 *
 * The failure is otherwise silent, as `usePremiumBenefits` documents: the benefits are the argument,
 * not the control, and the gift can still be sent without them.
 */
export function PremiumBenefitsPreviewDialog({ onClose }: { onClose: () => void }) {
    const { benefits, isLoading } = usePremiumBenefits()
    const isEmpty = !isLoading && benefits.length === 0

    /*
     * In an effect and not during render: `onClose` is the caller's `setState`, and setting another
     * component's state *while rendering* is the one thing React warns about by name. The cost is a
     * single frame in which nothing is drawn — which is what would be drawn anyway.
     */
    useEffect(() => {
        if (isEmpty) onClose()
    }, [isEmpty, onClose])

    if (isLoading || isEmpty) return null

    return (
        <PremiumBenefitDialog
            benefits={benefits}
            /* Opened from a button rather than from a row, so there is no benefit to open *on*. */
            initialIndex={0}
            subscribe={null}
            onClose={onClose}
        />
    )
}
