'use client'

import { useCallback, useState } from 'react'
import type { JoinOffer } from '../../lib/join-offer'
import type { JoinCurrency, JoinMembershipFlow, JoinStep } from './use-join-membership'

/**
 * `useJoinMembership` with the account taken out — **`/dev/become-a-member` only**.
 *
 * The real hook's `open` runs through `useRequireAuth`, so a signed-out developer never reaches the
 * dialogs. It returns `JoinMembershipFlow`, so the compiler fails here the moment the real hook grows
 * a field — the same contract, and the same reasoning, as
 * `features/donation/hooks/use-donate-flow-preview.ts`, which was written after a hand-built stub
 * quietly diverged from the thing it was standing in for.
 *
 * There is no arithmetic to mirror here (a membership is a tier at a fixed price), so what this
 * leaves out is exactly the two guards and the write.
 */
export function useJoinMembershipPreview(
    offer: JoinOffer | null,
): JoinMembershipFlow & { setStep: (step: JoinStep) => void; setNeedsCard: (v: boolean) => void } {
    const [step, setStep] = useState<JoinStep>('closed')
    const [needsCard, setNeedsCard] = useState(false)
    const [currency, setCurrency] = useState<JoinCurrency>('star')

    return {
        offer,
        step,
        needsCard,
        isJoining: false,
        currency,
        changeCurrency: setCurrency,
        offersCash: offer?.usd != null,
        /*
         * What a preview can honestly know: the **tier** carries a chargeable cash line. The real
         * hook also requires a `PaymentProvider` above it, which is a property of the surface rather
         * than of the offer — and hardcoding `false` here was worse than either, because it left the
         * harness showing a disabled Cash tab long after the real one had been wired.
         */
        isCashAvailable: offer?.cashPriceId != null,
        canJoin: Boolean(offer) && (currency === 'star' || offer?.cashPriceId != null),
        open: () => setStep('details'),
        close: useCallback(() => setStep('closed'), []),
        review: useCallback(() => setStep('confirm'), []),
        back: useCallback(() => setStep('details'), []),
        confirm: () => setStep('success'),
        setStep,
        setNeedsCard,
    }
}
