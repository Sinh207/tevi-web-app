'use client'

import { useTranslation } from '@shared/i18n/use-translation'
import { RISE } from '@shared/lib/motion'
import { cn } from '@shared/lib/utils'
import { Button } from '@shared/ui/button'
import { Icon } from '@shared/ui/icon'
import { Loader } from '@shared/ui/loader'
import { Radio } from '@shared/ui/radio'
import { AddressElement, PaymentElement, useElements } from '@stripe/react-stripe-js'
import type { StripeElements } from '@stripe/stripe-js'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { SavedCard } from '../api/types'
import { useCardName } from '../hooks/use-card-name'
import { cardExpiry, isCardPayable, pickPayableCard } from '../lib/card-brand'
import { CardBrandMark } from './card-brand-mark'

/** The scheme mark's width in a row; the new-method tile takes the same box so the rows align. */
const MARK_WIDTH = 36

/**
 * How many saved cards the group shows before "Show all". An account may hold ten
 * (`MAX_SAVED_CARDS`), and ten rows push the new-method row and the form below the fold of a
 * 720px dialog — the thing most readers came to press.
 */
const COLLAPSED_CARDS = 3

/**
 * Paying with a card: the saved ones, or a new method.
 *
 * ```
 *  Payment methods
 *  ┌──────────────────────────────────────────┐
 *  │ ● [VISA] Visa •••• 4242       (Default)  │  ← selected row tinted
 *  │          Expires 09/2027                 │
 *  ├──────────────────────────────────────────┤
 *  │ ○ [MC]   Mastercard •••• 1881            │
 *  ├──────────────────────────────────────────┤
 *  │        Show all cards (5) ⌄              │  ← only past three cards
 *  ├──────────────────────────────────────────┤
 *  │ ○ [＋]   Use a new payment method     ⌄  │  ← opens the form in place
 *  │   ┌ PaymentElement / AddressElement ┐    │
 *  └──────────────────────────────────────────┘
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
    const cardName = useCardName()

    /**
     * The first three, **plus the chosen card wherever it sits** — the seed can land past the cut
     * (three expired cards ahead of a live one), and a selection the reader cannot see is a Pay
     * button they cannot check. Expanding is one-way: there is nothing to gain from folding a list
     * back up in a dialog that closes after one payment.
     */
    const [showAll, setShowAll] = useState(false)
    const visibleCards =
        showAll || cards.length <= COLLAPSED_CARDS + 1
            ? cards
            : cards.filter((card, index) => index < COLLAPSED_CARDS || card.id === chosenId)
    const hiddenCount = cards.length - visibleCards.length

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
                {cards.length === 0 ? (
                    /*
                     * Nothing saved: the form *is* the panel. A group around a single expanded row
                     * would be a frame with one thing in it and a radio nobody can un-press.
                     */
                    <NewMethodForm onReady={revealForm} />
                ) : (
                    <>
                        <h3 className="type-caption-label-strong m-0 px-1 text-(--text-subtitle)">
                            {t('payment_payment_methods')}
                        </h3>
                        {/*
                         * **One group, hairlines between rows** — not a box per card. A box per card
                         * is `/card-management`'s arrangement, where each card carries its own
                         * actions; here the rows are the options of *one* question, and a single
                         * frame is what says so. It is also 24px shorter per card, which is the
                         * whole of "compact" on a phone with three saved cards.
                         *
                         * `overflow-clip`, not `overflow-hidden`: the rounded frame must clip the
                         * selected row's tint without becoming a scrollport.
                         */}
                        <div className="flex flex-col divide-y divide-(--separator-default) overflow-clip rounded-(--radius-lg) border border-(--separator-default) bg-(--background-surface)">
                            {visibleCards.map(card => {
                                const expiry = cardExpiry(card.card?.exp_month, card.card?.exp_year)
                                /*
                                 * Shown and **disabled**, not hidden. Hiding it leaves the reader
                                 * wondering where their card went; the row with "Expired" on it says
                                 * what to do — the same thing `/card-management` says about it.
                                 */
                                const payable = isCardPayable(card, now)
                                const checked = chosenId === card.id
                                return (
                                    /*
                                     * `Radio as="span"` renders the native input as a *descendant*,
                                     * which is the association this rule looks for — it simply cannot
                                     * see through a component. See `shared/ui/radio.tsx`.
                                     */
                                    // biome-ignore lint/a11y/noLabelWithoutControl: the input is inside `Radio`
                                    <label
                                        key={card.id}
                                        data-card-id={card.id}
                                        className={cn(
                                            'flex items-center gap-3 px-3 py-3 transition-colors',
                                            payable
                                                ? 'cursor-pointer hover:bg-(--background-subtle)'
                                                : 'cursor-not-allowed opacity-60',
                                            checked && 'bg-(--background-subtle)',
                                        )}
                                    >
                                        <Radio
                                            data-testid="payment-card-choice"
                                            as="span"
                                            checked={checked}
                                            disabled={isBusy || !payable}
                                            onChange={() => setChosenId(card.id)}
                                        />
                                        <CardBrandMark
                                            brand={card.card?.brand}
                                            width={MARK_WIDTH}
                                            className="flex-none"
                                        />
                                        <span className="flex min-w-0 flex-1 flex-col">
                                            {/* `dir="ltr"`: a brand then a masked number is a
                                                left-to-right sequence, and Arabic reorders it. */}
                                            <span
                                                dir="ltr"
                                                className="type-dense-strong truncate text-start text-(--text-title)"
                                            >
                                                {cardName(card)}
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
                                         * "Expired" wins the trailing slot over "Default": a reader
                                         * looking at their default card needs to know it is the one
                                         * that cannot be used, and both labels in one row is noise.
                                         */}
                                        {!payable ? (
                                            <span className="type-caption-meta flex-none text-(--text-error)">
                                                {t('payment_card_expired_badge')}
                                            </span>
                                        ) : (
                                            card.default && (
                                                <span className="type-caption-meta flex-none rounded-full bg-(--background-segment) px-2 py-0.5 text-(--text-subtitle)">
                                                    {t('payment_card_default_badge')}
                                                </span>
                                            )
                                        )}
                                    </label>
                                )
                            })}

                            {hiddenCount > 0 && (
                                <button
                                    data-testid="payment-card-show-all"
                                    type="button"
                                    disabled={isBusy}
                                    onClick={() => setShowAll(true)}
                                    className="type-dense-strong flex cursor-pointer items-center justify-center gap-1 border-0 bg-transparent px-3 py-2.5 text-(--text-link) outline-none hover:bg-(--background-subtle) focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-(--focus-ring) disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                    {t('payment_show_all_cards', { count: cards.length })}
                                    <Icon name="angle-down" size={16} />
                                </button>
                            )}

                            {/*
                             * The switch to a new method is a **radio in the same group**, not a
                             * button: it is one more way to pay, and the group is "which of these
                             * pays". It opens **in place**, as an accordion — legacy swaps the whole
                             * panel ("Pay another way"), so the reader loses sight of the list.
                             *
                             * The row and its form share one `divide-y` child, so no hairline cuts
                             * the header off from what it opened.
                             */}
                            <div>
                                {/* biome-ignore lint/a11y/noLabelWithoutControl: the input is inside `Radio` */}
                                <label
                                    ref={newMethodRef}
                                    className="flex cursor-pointer items-center gap-3 px-3 py-3 transition-colors hover:bg-(--background-subtle)"
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
                                    {/* The brand mark's own box, dashed — so the new-method row
                                        lines up with the cards above it instead of jutting left. */}
                                    <span
                                        aria-hidden="true"
                                        style={{ width: MARK_WIDTH }}
                                        className="flex aspect-[39/25] flex-none items-center justify-center rounded-[4px] border border-(--separator-default) border-dashed text-(--icon-secondary)"
                                    >
                                        <Icon name="plus" size={16} />
                                    </span>
                                    <span className="type-dense-strong flex-1 text-(--text-title)">
                                        {t('payment_new_method')}
                                    </span>
                                    <Icon
                                        name="angle-down"
                                        size={16}
                                        className={cn(
                                            'flex-none text-(--icon-secondary) transition-[rotate] duration-200 motion-reduce:transition-none',
                                            isNewMethod && 'rotate-180',
                                        )}
                                    />
                                </label>
                                {isNewMethod && (
                                    <div className={cn('px-3 pt-1 pb-4', RISE)}>
                                        <NewMethodForm onReady={revealForm} />
                                    </div>
                                )}
                            </div>
                        </div>
                    </>
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

/**
 * The new-method form: `PaymentElement` (card, Apple Pay, Google Pay, local wallets) and the billing
 * address. Billing address, because a card charge is where the schemes' fraud checks want it — and
 * Stripe's own element ships the country list, already translated. `phone: 'never'`, as in the
 * add-card dialog: nothing here uses it.
 */
function NewMethodForm({ onReady }: { onReady: () => void }) {
    return (
        <div className="flex flex-col gap-3">
            <PaymentElement
                options={{ layout: { type: 'tabs', defaultCollapsed: false } }}
                onReady={onReady}
            />
            <AddressElement options={{ mode: 'billing', fields: { phone: 'never' } }} />
        </div>
    )
}
