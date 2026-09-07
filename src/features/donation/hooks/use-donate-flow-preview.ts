'use client'

import { useCallback, useState } from 'react'
import type { DirectDonate, DonationTarget } from '../api/types'
import {
    amountFromQuantity,
    canDonate,
    type DonationCurrency,
    hasPrice,
    quantityFromAmount,
    toNumber,
    unitPrice,
} from '../lib/donation-amount'
import type { DonateFlow, DonateStep } from './use-donate-flow'

/**
 * `useDonateFlow` with the account taken out — **`/dev/donate` only**.
 *
 * ## Why this exists rather than a hand-written object in the harness
 *
 * The real hook's `open` runs through `useRequireAuth`, so a signed-out developer never reaches the
 * dialogs — which is correct behaviour and makes the three screens unpreviewable exactly when you
 * want to look at them. The harness therefore has to drive a flow itself.
 *
 * It did, and the object it wrote was **wrong in a way that produced false confidence**: it held the
 * quantity and derived the amount from it, so typing into the amount field appeared to work while
 * silently re-deriving whatever it liked. A browser check written against it reported that a
 * sanitised `12ab3e-4.5` became `10000000`, which is not what the real form does — the harness was
 * being measured, not the feature.
 *
 * So the preview reuses **the same pure functions the real hook does** (`unitPrice`,
 * `amountFromQuantity`, `quantityFromAmount`, `canDonate`). What it leaves out is exactly the three
 * things that need an account — the auth gate, the Star gate and the write — and nothing else. It
 * returns `DonateFlow`, so the compiler fails here the moment the real hook grows a field.
 */
export function useDonateFlowPreview(
    offer: DirectDonate,
    _target: DonationTarget,
): DonateFlow & { setStep: (step: DonateStep) => void } {
    const [currency, setCurrency] = useState<DonationCurrency>('star')
    const [step, setStep] = useState<DonateStep>('closed')
    const [amount, setAmount] = useState(String(unitPrice(offer, 'star')))
    const [message, setMessage] = useState('')

    const unit = unitPrice(offer, currency)
    /** Derived, exactly as the real form's two fields relate: the amount is what is charged. */
    const quantity = String(quantityFromAmount(amount, unit))

    const changeQuantity = useCallback(
        (next: string) => setAmount(String(amountFromQuantity(next, unit))),
        [unit],
    )

    return {
        offer,
        isLoading: false,
        unit,
        currency,
        changeCurrency: next => {
            setCurrency(next)
            setAmount(String(amountFromQuantity(quantity, unitPrice(offer, next))))
        },
        offersCash: hasPrice(offer, 'cash'),
        isCashAvailable: false,
        step,
        quantity,
        amount,
        message,
        setMessage,
        changeQuantity,
        changeAmount: setAmount,
        stepBy: delta => changeQuantity(String(Math.max(1, toNumber(quantity) + delta))),
        canSubmit: canDonate(amount, unit) && currency === 'star',
        isDonating: false,
        open: () => setStep('details'),
        close: () => setStep('closed'),
        review: () => setStep('confirm'),
        back: () => setStep('details'),
        // No write to make. The two live surfaces on the harness exercise the real one.
        confirm: () => setStep('success'),
        setStep,
    }
}
