'use client'

import { useTranslation } from '@shared/i18n/use-translation'
import { cn } from '@shared/lib/utils'
import { Button } from '@shared/ui/button'
import { Icon } from '@shared/ui/icon'
import { Loader } from '@shared/ui/loader'
import { Radio } from '@shared/ui/radio'
import { AddressElement, PaymentElement, useElements } from '@stripe/react-stripe-js'
import type { StripeElements } from '@stripe/stripe-js'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { SavedCard } from '../api/types'
import {
    cardExpiry,
    isCardPayable,
    maskedCardNumber,
    pickPayableCard,
    savedCardTitle,
} from '../lib/card-brand'
import { CardBrandMark } from './card-brand-mark'

/**
 * Paying with a card: the saved ones, or a new method.
 *
 * ```
 *  ● [VISA] ···· ···· ···· 4242        Default
 *  ○ [MC]   ···· ···· ···· 1881
 *  ＋ Add a new card                            ← switches to the PaymentElement
 *  ──────────────────────────────────────────
 *  [ Pay $10.29 ]
 *  🔒 Card details are handled by Stripe…
 * ```
 *
 * ## Two modes, one submit
 *
 * A saved card pays with `payment_method: pm_…` and needs no mounted form; anything else pays through
 * the `PaymentElement`, which is where Apple Pay, Google Pay and the local wallets live. The button is
 * the same button — `onSubmit` hands the parent either the id or the `Elements` instance, and
 * `useCheckout.submit` branches on which it got. Legacy has two components, two confirm calls and two
 * different failure paths for this.
 *
 * ## The amount is on the button
 *
 * `Pay $10.29`, not `Done` (legacy's label). A button that takes money should say how much, and it is
 * the last thing the reader looks at before it happens.
 *
 * ## Nothing here knows about the checkout
 *
 * No `clientSecret`, no machine, no polling — the panel is inside `<StripeElementsScope>` and reports a
 * press. That is what lets a settle outlive it (`PaymentProvider`), and what keeps this component
 * previewable.
 */
export function PayWithCardPanel({
    cards,
    amountLabel,
    isBusy,
    onPay,
}: {
    /** Saved cards, or an empty list — which opens straight on the new-method form. */
    cards: SavedCard[]
    /**
     * Already formatted by the caller, which is the only thing that knows the currency. `''` falls back
     * to a bare "Pay" — a handoff created by another feature may have no figure to print, and
     * "Pay undefined" is the one outcome to avoid.
     */
    amountLabel: string
    isBusy: boolean
    /**
     * The press. Exactly one of the two arrives: a saved `pm_…`, or the **live `Elements` instance** —
     * which only a component inside `<StripeElementsScope>` can hand over, and which is the whole
     * reason this panel exists as its own component.
     */
    onPay: (choice: { paymentMethodId?: string; elements?: StripeElements | null }) => void
}) {
    const { t } = useTranslation()
    const elements = useElements()

    /*
     * One `now` for the whole panel, taken per mount: eight rows must not each read the clock and
     * disagree about which month it is, and a test cannot pin "expired" against a moving one. Same call
     * as `SavedCardList`.
     */
    const now = useMemo(() => new Date(), [])

    /**
     * `null` means "a new method" — the `PaymentElement`.
     *
     * Seeded from the cards on first render rather than in an effect: the list is a prop, so there is
     * nothing to wait for, and an effect would render one frame with nothing selected.
     *
     * **`pickPayableCard`, not the default card.** An expired card is a guaranteed decline, and an
     * account whose *default* card has expired used to open this panel pre-selected on it: the reader
     * pressed Pay, the scheme refused, and nothing between the two had said why. With nothing usable
     * saved this lands on `null`, i.e. the new-method form — the only option left that can complete
     * the payment.
     */
    const [chosenId, setChosenId] = useState<string | null>(
        () => pickPayableCard(cards, now)?.id ?? null,
    )
    const isNewMethod = chosenId === null

    const newMethodRef = useRef<HTMLLabelElement | null>(null)
    /**
     * Whether the reader **pressed** for the new-method form, as opposed to the panel opening on it.
     *
     * It opens on the form whenever nothing saved can be paid with (an expired default, or no cards at
     * all), and scrolling on mount there would be a jump with nothing above it to scroll past. Only a
     * press earns the reveal.
     */
    const asked = useRef(false)

    /**
     * Bring the form into view after it appears.
     *
     * The radio sits **above** the form, so on a phone — or with three saved cards — selecting it
     * revealed a `PaymentElement` entirely below the fold: the panel looked like it had done nothing.
     * The **radio row** is what is scrolled to, not the form: it stays visible at the top, so the
     * reader can still see what they just selected.
     *
     * Called twice on purpose. The first pass acknowledges the press immediately; the second runs from
     * `PaymentElement`'s own `onReady`, because Stripe mounts an iframe and the block has no real
     * height until it does — a single scroll lands short by exactly the form.
     */
    const revealForm = useCallback(() => {
        if (!asked.current) return
        const reduced =
            typeof window !== 'undefined' &&
            window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
        newMethodRef.current?.scrollIntoView({
            block: 'start',
            behavior: reduced ? 'auto' : 'smooth',
        })
    }, [])

    useEffect(() => {
        if (isNewMethod) revealForm()
    }, [isNewMethod, revealForm])

    return (
        <form
            data-testid="payment-card-panel-form"
            className="flex min-h-0 flex-1 flex-col"
            onSubmit={event => {
                event.preventDefault()
                if (isBusy) return
                if (isNewMethod) {
                    // `elements` is null until the scope has mounted; the button is disabled then.
                    if (elements) onPay({ elements })
                    return
                }
                /*
                 * Re-checked at the press rather than trusted from the seed. The radio is disabled, so
                 * this is unreachable through the UI — but the list is a prop and a card can be expired
                 * by the time it arrives, and sending one is a decline the reader gets blamed for.
                 */
                const chosen = cards.find(card => card.id === chosenId)
                if (!chosen || !isCardPayable(chosen, now)) return
                onPay({ paymentMethodId: chosenId })
            }}
        >
            <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-4">
                {cards.map(card => {
                    const title = savedCardTitle(card)
                    const label = 'text' in title ? title.text : t(title.key)
                    const number = maskedCardNumber(card.card?.last4)
                    const expiry = cardExpiry(card.card?.exp_month, card.card?.exp_year)
                    /*
                     * Shown and **disabled**, not hidden. Hiding it leaves the reader wondering where
                     * their card went; the row with "Expired" on it says what to do — the same thing
                     * `/card-management` says about the same card.
                     */
                    const payable = isCardPayable(card, now)
                    return (
                        /*
                         * `Radio as="span"` renders the native input as a *descendant*, which is the
                         * association this rule looks for — it simply cannot see through a component.
                         * See `shared/ui/radio.tsx` on why the row, not the control, is the label.
                         */
                        // biome-ignore lint/a11y/noLabelWithoutControl: the input is inside `Radio`
                        <label
                            key={card.id}
                            className={cn(
                                'flex items-center gap-3 rounded-(--radius-md) border p-3',
                                payable ? 'cursor-pointer' : 'cursor-not-allowed opacity-60',
                                chosenId === card.id
                                    ? 'border-(--button-accent-bg)'
                                    : 'border-(--separator-default)',
                            )}
                        >
                            <Radio
                                data-testid="payment-card-choice"
                                as="span"
                                checked={chosenId === card.id}
                                disabled={isBusy || !payable}
                                onChange={() => setChosenId(card.id)}
                            />
                            <CardBrandMark
                                brand={card.card?.brand}
                                width={36}
                                className="flex-none"
                            />
                            <span className="flex min-w-0 flex-1 flex-col">
                                <span
                                    dir="ltr"
                                    className="type-dense-strong truncate text-(--text-title)"
                                >
                                    {number ?? label}
                                </span>
                                {expiry && (
                                    <span
                                        className={cn(
                                            'type-caption-meta truncate',
                                            payable
                                                ? 'text-(--text-subtitle)'
                                                : 'text-(--text-error)',
                                        )}
                                    >
                                        {t(
                                            payable
                                                ? 'payment_card_expires'
                                                : 'payment_card_expired_on',
                                            { date: expiry },
                                        )}
                                    </span>
                                )}
                            </span>
                            {/*
                             * "Expired" wins the trailing slot over "Default": a reader looking at
                             * their default card needs to know it is the one that cannot be used, and
                             * both labels in one row is noise on the row they cannot press.
                             */}
                            {!payable ? (
                                <span className="type-caption-meta flex-none text-(--text-error)">
                                    {t('payment_card_expired_badge')}
                                </span>
                            ) : (
                                card.default && (
                                    <span className="type-caption-meta flex-none text-(--text-disabled)">
                                        {t('payment_card_default_badge')}
                                    </span>
                                )
                            )}
                        </label>
                    )
                })}

                {/*
                 * The switch to a new method is a **radio in the same group**, not a button: it is one
                 * more way to pay, and the group is "which of these pays". Legacy makes it a separate
                 * "Pay another way" button that swaps the panel, so the reader loses their place in the
                 * list and cannot see what they were on.
                 */}
                {cards.length > 0 && (
                    // biome-ignore lint/a11y/noLabelWithoutControl: the input is inside `Radio`
                    <label
                        ref={newMethodRef}
                        className={cn(
                            'flex cursor-pointer items-center gap-3 rounded-(--radius-md) border p-3',
                            isNewMethod
                                ? 'border-(--button-accent-bg)'
                                : 'border-(--separator-default)',
                        )}
                    >
                        <Radio
                            data-testid="payment-card-new"
                            as="span"
                            checked={isNewMethod}
                            disabled={isBusy}
                            onChange={() => {
                                asked.current = true
                                setChosenId(null)
                            }}
                        />
                        <Icon name="plus" size={20} className="flex-none text-(--text-subtitle)" />
                        <span className="type-dense-strong flex-1 text-(--text-title)">
                            {t('payment_new_method')}
                        </span>
                    </label>
                )}

                {isNewMethod && (
                    <div className="flex flex-col gap-3 pt-1">
                        <PaymentElement
                            options={{ layout: { type: 'tabs', defaultCollapsed: false } }}
                            onReady={revealForm}
                        />
                        {/*
                         * Billing address, because a card charge is where the schemes' fraud checks
                         * want it — and Stripe's own element ships the country list, already
                         * translated. `phone: 'never'`, as in the add-card dialog: nothing here uses it.
                         */}
                        <AddressElement options={{ mode: 'billing', fields: { phone: 'never' } }} />
                    </div>
                )}
            </div>

            <div className="flex flex-none flex-col gap-3 border-(--separator-default) border-t p-4">
                <Button
                    data-testid="payment-card-submit"
                    type="submit"
                    variant="accent"
                    size="large"
                    className="w-full"
                    disabled={isBusy || (isNewMethod && !elements)}
                >
                    {isBusy && <Loader className="size-[18px]" />}
                    {amountLabel
                        ? t('payment_pay_amount', { amount: amountLabel })
                        : t('payment_pay')}
                </Button>
                <p className="type-caption-meta m-0 flex items-center justify-center gap-1 text-(--text-subtitle)">
                    <Icon
                        name="lock-simple"
                        size={16}
                        className="flex-none text-(--icon-secondary)"
                    />
                    {t('payment_secured_by_stripe')}
                </p>
            </div>
        </form>
    )
}
