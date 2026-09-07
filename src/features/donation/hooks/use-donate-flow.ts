'use client'

import { useAuth, useRequireAuth } from '@features/auth'
import { balanceKeys, useRequireStars } from '@features/balance'
import { DEFAULT_GATEWAY_ID, usePaymentOptional } from '@features/payment'
import { useTranslation } from '@shared/i18n/use-translation'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useCallback, useState } from 'react'
import { donationApi, donationKeys } from '../api/donation-api'
import type { DonationTarget } from '../api/types'
import {
    amountFromQuantity,
    canDonate,
    DONATION_USD,
    type DonationCurrency,
    hasPrice,
    quantityFromAmount,
    toNumber,
    unitPrice,
} from '../lib/donation-amount'
import { useDirectDonate } from './use-direct-donate'

/** Details → Confirm → Success, and the state where none of them is on screen. */
export type DonateStep = 'closed' | 'details' | 'confirm' | 'success'

/**
 * Whether a card donation can be completed **here**.
 *
 * No longer a constant: `features/payment` exists, so the answer is "yes, if this dialog has what the
 * card checkout needs". Two things are needed and neither is about the creator:
 *
 * - the **channel id**, because `checkout/v3/checkout/donation/` takes `channel_id` while the Star path
 *   posts to the slug (see `DonationTarget.id`); a target assembled without one can still take Star,
 * - a **`PaymentProvider` above this dialog**, which `(web)/layout.tsx` mounts and a `/app/*` webview
 *   deliberately does not — card payment is hidden there because the native app must use IAP.
 *
 * Both are read rather than assumed, so the cash tab is offered exactly where it can be completed
 * instead of showing a button that 400s or does nothing.
 */
function canPayByCard(target: DonationTarget, hasPaymentProvider: boolean): boolean {
    return hasPaymentProvider && Boolean(target.id)
}

/**
 * The donate flow — the offer, the form, the two guards and the write.
 *
 * ## The form holds strings, and that is the point
 *
 * `quantity` and `amount` are the **raw field values**, never numbers. A controlled numeric input
 * that coerces every keystroke cannot be typed into: clearing it, a leading `0`, the moment after
 * a `.` — each one round-trips through state and fights the caret. So the arithmetic lives in
 * `lib/donation-amount.ts` behind `toNumber`, and nothing in this file does maths on a field value
 * directly. Legacy reached the same conclusion and left two bug comments on the way there.
 *
 * ## The two fields move each other, and only one direction is lossy
 *
 * The stepper sets the amount exactly (`quantity × unit`). Typing an amount sets the quantity to
 * the number of **whole** units it covers, so 250 Star at 100 a coffee reads "2" — the amount is
 * what is charged and the counter is a convenience. Rounding the amount up to match the counter
 * would silently change what someone is about to spend.
 *
 * ## Where each guard sits, and why they are not in the same place
 *
 * - **Auth gates `open`.** An anonymous visitor pressing Donate gets the login dialog immediately.
 *   Legacy instead lets them fill the whole form and only bounces them at the final press, which
 *   spends the reader's effort before telling them it could not be used. It also avoids stacking
 *   the login dialog on top of an open confirm dialog — two modals fighting over the focus trap.
 * - **Star gates the final press**, through `useRequireStars`, because that is the moment the price
 *   is known: the amount can change right up to the confirm screen. It composes `useRequireAuth`
 *   again, which is a no-op by then — the ordering is stated once, in that hook.
 *
 * A shortfall raises a toast **over** the open confirm dialog rather than closing it: the form is
 * still exactly what the reader assembled, and when the top-up flow lands (`useRequireStars` is one
 * line from it) they come back to it rather than to an empty page. Legacy closes the dialog and
 * discards the form.
 *
 * ## Star and cash are one form with one number, not two forms
 *
 * The offer is priced in both, and switching between them keeps the **quantity** rather than the
 * amount: "three coffees" is what the reader chose, and `$3` is not the same thought as `300 Star`.
 * Legacy switches the other way — it keeps each currency's amount in its own `useState` and
 * back-computes a quantity from whichever is showing — which is why its two numbers drift apart the
 * moment you change one and then switch.
 *
 * ⚠ **Cash cannot be completed yet**, and `canSubmit` says so rather than the button lying: the
 * checkout is `checkout/v3/checkout/donation/` on the payments service plus Stripe Elements for the
 * card, and this repo has no payment integration at all. The tab is still offered because the price
 * is real and the reader should see what the creator set; `isCashAvailable` is the single flag to
 * flip when it lands, and it is deliberately a constant here rather than scattered `currency ===`
 * checks at the call sites.
 *
 * ## No optimistic anything
 *
 * The write moves money. `donation_count` is bumped by invalidating the offer, not by patching the
 * cache — legacy patches it locally, which shows the creator's supporter count going up even when
 * the charge failed on a path it did not model.
 */
export function useDonateFlow(target: DonationTarget) {
    const { t } = useTranslation()
    const { activeId } = useAuth()
    const requireAuth = useRequireAuth()
    const requireStars = useRequireStars()
    const queryClient = useQueryClient()
    const { offer, isLoading } = useDirectDonate(target.slug)
    /*
     * `null` outside a `PaymentProvider` — a `/app/*` webview, or a test rendering this dialog alone.
     * The hook is the optional one for exactly this reason (see `usePaymentOptional`).
     */
    const payment = usePaymentOptional()
    const isCashAvailable = canPayByCard(target, payment !== null)

    const [currency, setCurrency] = useState<DonationCurrency>('star')
    const unit = unitPrice(offer, currency)

    const [step, setStep] = useState<DonateStep>('closed')
    const [quantity, setQuantity] = useState('1')
    const [amount, setAmount] = useState('')
    const [message, setMessage] = useState('')

    /**
     * Seeded on **open**, not on mount and not on the offer arriving.
     *
     * The unit price is not known until the query resolves, so an initial value would be seeded
     * from the fallback and then either stick (wrong) or be overwritten mid-edit (worse — that is
     * the bug `edit-profile-view.tsx` documents at length). Opening is the one moment where
     * "start from the offer's price" and "the reader has typed nothing yet" are both true.
     */
    const open = requireAuth(() => {
        // Star every time, not the last choice: it is the one that can be completed, and a form that
        // reopens on a tab the reader cannot pay from is a worse default than a forgotten preference.
        setCurrency('star')
        setQuantity('1')
        setAmount(String(unitPrice(offer, 'star')))
        setMessage('')
        setStep('details')
    })

    const close = useCallback(() => setStep('closed'), [])

    const changeQuantity = useCallback(
        (next: string) => {
            setQuantity(next)
            setAmount(String(amountFromQuantity(next, unit)))
        },
        [unit],
    )

    /** The stepper's two halves. Never below one — an offer of zero coffees is not a donation. */
    const stepBy = useCallback(
        (delta: number) => {
            const next = Math.max(1, toNumber(quantity) + delta)
            changeQuantity(String(next))
        },
        [changeQuantity, quantity],
    )

    const changeAmount = useCallback(
        (next: string) => {
            setAmount(next)
            setQuantity(String(quantityFromAmount(next, unit)))
        },
        [unit],
    )

    /**
     * Switching tabs re-prices the **same quantity**, it does not convert the amount. Three coffees
     * stay three coffees; `300` does not become `$300`.
     */
    const changeCurrency = useCallback(
        (next: DonationCurrency) => {
            setCurrency(next)
            setAmount(String(amountFromQuantity(quantity, unitPrice(offer, next))))
        },
        [offer, quantity],
    )

    const donate = useMutation({
        /*
         * The account travels **in the variables**, not read out of the render inside `onSuccess`.
         * TanStack replaces a pending mutation's options on every re-render, so a callback that reads
         * `activeId` runs against whichever account is active when the answer lands: the Star was
         * debited from A while A's balance was left stale and B's was refreshed instead — switch back
         * and the pre-spend figure is still on screen.
         */
        mutationFn: (accountId: string | null) =>
            donationApi.donateStars(target.slug, { amount: toNumber(amount), message }, accountId),
        onSuccess: () => {
            /*
             * Star was spent, and the offer's supporter count moved.
             *
             * `balanceKeys.all` rather than `refreshBalance()` — that helper invalidates whichever
             * account is active *now*, which after a mid-flight switch is the one account this debit
             * did not touch. The prefix covers every account's figure and both ledgers.
             */
            void queryClient.invalidateQueries({ queryKey: balanceKeys.all })
            queryClient.invalidateQueries({ queryKey: donationKeys.all })
            setStep('success')
        },
        // A message, not a key — the toast is raised outside React by `query-client.ts`.
        meta: { showErrorToast: t('donation_error') },
    })

    const submitStars = requireStars(toNumber(amount), () => {
        if (!canDonate(amount, unit) || donate.isPending) return
        donate.mutate(activeId)
    })

    /**
     * `useRequireStars` is applied **only** to the Star press. Wrapping the cash one would weigh a
     * dollar figure against a Star balance and refuse a card payment for being short of Star — the
     * kind of unit mix-up that looks like a permissions bug from the outside.
     *
     * The cash press builds a `CheckoutOrder` and hands it over; everything after that — the intent,
     * the card form, 3DS, the settle — belongs to `PaymentProvider`. This dialog closes itself, because
     * the checkout owns the screen from here and two stacked dialogs is the alternative. The **offer**
     * is invalidated on the way out rather than on success: a card payment can settle a minute later,
     * on a page this dialog no longer exists on, and the provider invalidates then too.
     */
    const confirm = () => {
        if (currency === 'star') {
            submitStars()
            return
        }
        if (!isCashAvailable || !payment || !target.id) return
        const usd = toNumber(amount)
        if (!canDonate(usd, unit)) return

        payment.checkout({
            kind: 'donation',
            gatewayId: DEFAULT_GATEWAY_ID,
            channelId: target.id,
            amountUsd: usd,
            message: message.trim() || undefined,
            /*
             * What the Pay button says. The **donation**, not the total: the fee row on the confirm
             * screen has already shown what the processor adds, and a button naming a bigger figure
             * than the one the reader typed reads as a bait-and-switch. `chargedTotal` is what the
             * fee row prints; this is what they chose to give.
             */
            amountLabel: `${DONATION_USD.symbol}${usd.toFixed(2)}`,
        })
        setStep('closed')
    }

    return {
        offer,
        isLoading,
        unit,
        currency,
        changeCurrency,
        /** Whether the offer prices this option at all — decides if the tab is offered. */
        offersCash: hasPrice(offer, 'cash'),
        /** Whether the cash tab can actually be completed here — see `canPayByCard`. */
        isCashAvailable,
        step,
        quantity,
        amount,
        message,
        setMessage,
        changeQuantity,
        changeAmount,
        stepBy,
        canSubmit: canDonate(amount, unit) && (currency === 'star' || isCashAvailable),
        isDonating: donate.isPending,
        open,
        close,
        review: useCallback(() => setStep('confirm'), []),
        back: useCallback(() => setStep('details'), []),
        confirm,
    }
}

export type DonateFlow = ReturnType<typeof useDonateFlow>
