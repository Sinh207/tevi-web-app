'use client'

import { useTranslation } from '@shared/i18n/use-translation'
import {
    Alert,
    AlertActions,
    AlertContent,
    AlertIcon,
    AlertSubtitle,
    AlertTitle,
} from '@shared/ui/alert'
import { Button } from '@shared/ui/button'
import { Checkbox } from '@shared/ui/checkbox'
import { Dialog, DialogClose, DialogContent, DialogTitle } from '@shared/ui/dialog'
import { Icon } from '@shared/ui/icon'
import { Loader } from '@shared/ui/loader'
import { AddressElement, PaymentElement } from '@stripe/react-stripe-js'
import { useEffect, useId, useState } from 'react'
import { useAddCard, useCardSetupForm } from '../hooks/use-add-card'
import { useStripeConfig } from '../hooks/use-stripe-config'
import { StripeElementsScope } from './stripe-elements-scope'

/**
 * Saving a card — one `PaymentElement`, one `AddressElement`, and nothing hand-mounted.
 *
 * ## What this replaces
 *
 * Legacy's `paymentMethods/index.js` creates **four** elements by hand (`cardNumber`, `cardExpiry`,
 * `cardCvc`, `postalCode`), mounts each into a `#id` through a ref, tracks a `complete` and an
 * `error` flag per element, and builds its own country `<select>` from `CoreModel.getCountries`. The
 * whole of that is two components here: Stripe validates, localises, formats and lists countries
 * itself — and, unlike four card fields, a `PaymentElement` can also offer Link and the local wallets
 * the account is eligible for. `docs/PAYMENT.md` §4.3 is the instruction; this is it.
 *
 * ## Four states, and "no client secret" is one of them
 *
 * Preparing → form → confirming, plus **unavailable**. That last one is `POST my-payment-methods/`
 * answering without a client secret, or Stripe's script not loading, or the publishable key being
 * absent. Legacy renders an empty `<Elements>` for all three: a dialog with a header over blank
 * space, and no way for the reader to tell whether to keep waiting. A missing secret is an error
 * state with a retry, not an empty form.
 *
 * ## A centred dialog at every width, deliberately
 *
 * `docs/PAYMENT.md` §4 asks for a bottom sheet below `md`, and this app has **no bottom-sheet
 * primitive**: the DS draws one (`Sheet/Bottom Sheet`) and porting it is a `shared/ui` job other
 * screens want too, which DoD §10 forbids hand-rolling. So this follows
 * `membership-detail-dialog.tsx` — the DS `Dialog`, 370 wide with `max-w-[calc(100vw-2rem)]`, so a
 * phone gets a card with 16px either side. When the sheet lands, only the shell around this content
 * changes.
 *
 * ⚠ **A sheet exists now** — `shared/ui/sheet.tsx`, Base UI's `Drawer` behind this app's tokens,
 * wired to the post composer's popups through `ResponsiveDialog`. It is a **trailing-edge,
 * full-screen** panel (legacy's composer geometry); the DS's own `.tevi-bottom-sheet` is still
 * unreadable, so a *bottom* variant does not exist yet. This screen is deliberately not switched:
 * the composer was the agreed first cut, and moving anything else is a product call rather than a
 * refactor. Switching it is `ResponsiveDialog` plus the `className` already here.
 * ## The body scrolls, the title and the footer do not
 *
 * `gap-0 p-0` overrides the DS Dialog's inset and gap and the padding moves into the three bands, for
 * the reason the membership dialog gives: otherwise the scrollbar runs inside 24px of dead margin and
 * the title scrolls away with the form. The card form is the one dialog in this app that genuinely
 * cannot fit a short viewport — an `AddressElement` is six fields.
 */
export function AddCardDialog({
    open,
    onOpenChange,
    returnPath,
    showDefaultOption,
}: {
    open: boolean
    onOpenChange: (open: boolean) => void
    /** Path a 3DS hop returns to. This app's own pathname — never a value off the payload. */
    returnPath: string
    /**
     * Offer "make this the default".
     *
     * `false` for the first card, because there is nothing for it to displace — the backend has one
     * method and it is the default by arithmetic. A checkbox that cannot change the outcome is a
     * decision the reader is asked to make for nothing.
     */
    showDefaultOption: boolean
}) {
    const { t } = useTranslation()
    const { clientSecret, accountId, isPreparing, isUnavailable, retry } = useAddCard({ open })
    /*
     * Read here as well as inside `StripeElementsScope`: the scope renders its `fallback` when there
     * is no key, and this dialog has to know *which* fallback that is — a wait or a failure. One
     * query key, so the second read costs nothing (`useStripeConfig`).
     */
    const stripeConfig = useStripeConfig()

    /**
     * The Stripe script itself could not be used — blocked by an extension, a proxy or a CSP mistake.
     * `StripeElementsScope` reports it (`getStripe` resolves `null`), and without this the dialog
     * rendered its title over an empty body with a live Save button and no explanation.
     */
    const [scriptBlocked, setScriptBlocked] = useState(false)
    /**
     * `stripe.confirmSetup` is in flight, lifted out of the form because the *dialog* owns dismissal.
     * The form is inside `<Elements>` and cannot be, which is why this is a callback rather than a
     * hook read here.
     */
    const [isConfirming, setIsConfirming] = useState(false)

    const failed = isUnavailable || stripeConfig.isUnavailable || scriptBlocked
    const waiting = !failed && (isPreparing || stripeConfig.isLoading)

    return (
        <Dialog
            open={open}
            /*
             * Refused while confirming, exactly as `CheckoutStatusDialog` refuses it: closing here
             * unmounts `<Elements>` **mid-confirmation**, and `useAddCard`'s close effect then
             * `reset()`s the pending mutation — so the 3DS challenge is torn off the screen, the
             * promise is orphaned, nothing is reported, and the SetupIntent may still complete
             * server-side. The card then silently appears (or does not) on the next load.
             */
            onOpenChange={next => {
                if (next || !isConfirming) onOpenChange(next)
            }}
            disablePointerDismissal={isConfirming}
        >
            <DialogContent className="max-h-[min(88vh,720px)] gap-0 overflow-hidden p-0">
                {/* Legacy's title band: dismiss on the leading side, title centred. `xmark` at every
                    width — this is a card, not a full-height drawer. */}
                <div className="relative flex h-14 flex-none items-center justify-center border-(--separator-default) border-b px-2">
                    {/* Disabled, not hidden: a control that disappears mid-flow reads as a bug, and
                        the reader needs to see that dismissing is *temporarily* unavailable. */}
                    <DialogClose
                        data-testid="payment-add-card-close-x"
                        aria-label={t('common_close')}
                        disabled={isConfirming}
                        className="absolute start-2 flex size-10 cursor-pointer items-center justify-center rounded-full border-0 bg-transparent text-(--text-title) outline-none hover:bg-(--background-segment) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--focus-ring) disabled:cursor-not-allowed disabled:opacity-40"
                    >
                        <Icon name="xmark" size={20} />
                    </DialogClose>
                    <DialogTitle className="truncate">{t('payment_add_card_title')}</DialogTitle>
                </div>

                {failed ? (
                    <div className="flex flex-col gap-4 p-4">
                        <Alert status="error">
                            <AlertIcon status="error" />
                            <AlertContent>
                                <AlertTitle>{t('payment_card_form_unavailable_title')}</AlertTitle>
                                <AlertSubtitle>
                                    {t('payment_card_form_unavailable_body')}
                                </AlertSubtitle>
                                <AlertActions>
                                    <Button
                                        data-testid="payment-add-card-close"
                                        variant="secondary"
                                        size="medium"
                                        onClick={() => {
                                            /*
                                             * Both halves can be the reason, so both are retried: a
                                             * missing publishable key and a SetupIntent that came back
                                             * empty produce the same screen, and asking the reader to
                                             * work out which is not an option.
                                             */
                                            void stripeConfig.refresh()
                                            retry()
                                        }}
                                    >
                                        {t('common_retry')}
                                    </Button>
                                </AlertActions>
                            </AlertContent>
                        </Alert>
                    </div>
                ) : waiting ? (
                    <div className="flex min-h-[240px] items-center justify-center p-4">
                        <Loader label={t('common_loading')} />
                    </div>
                ) : (
                    <StripeElementsScope
                        clientSecret={clientSecret}
                        onUnavailable={() => setScriptBlocked(true)}
                        fallback={
                            <div className="flex min-h-[240px] items-center justify-center p-4">
                                <Loader label={t('common_loading')} />
                            </div>
                        }
                    >
                        <AddCardForm
                            accountId={accountId}
                            returnPath={returnPath}
                            showDefaultOption={showDefaultOption}
                            onConfirmingChange={setIsConfirming}
                            onCancel={() => onOpenChange(false)}
                            onSaved={() => onOpenChange(false)}
                        />
                    </StripeElementsScope>
                )}
            </DialogContent>
        </Dialog>
    )
}

/**
 * The form itself — separate because it must live **inside** `<Elements>`.
 *
 * `useStripe()` and `useElements()` read a context `StripeElementsScope` provides, so a hook calling
 * them cannot be in the component that mounts the scope. That is the whole reason for the split, and
 * it is also why `useCardSetupForm` is not merged into `useAddCard`.
 */
function AddCardForm({
    accountId,
    returnPath,
    showDefaultOption,
    onConfirmingChange,
    onCancel,
    onSaved,
}: {
    accountId: string | null
    returnPath: string
    showDefaultOption: boolean
    /** Reported upward because the dialog, not the form, owns whether it can be dismissed. */
    onConfirmingChange: (confirming: boolean) => void
    onCancel: () => void
    onSaved: () => void
}) {
    const { t } = useTranslation()
    const [setAsDefault, setSetAsDefault] = useState(false)
    const { confirm, isConfirming, errorText, errorKey, clearError } = useCardSetupForm({
        accountId,
        returnPath,
        onSaved,
    })
    /*
     * `useId` rather than a literal: this dialog is mounted once per screen today, and a literal id
     * is the kind of thing that silently stops labelling anything the day two of them are on a page.
     */
    const defaultCheckboxId = useId()

    /*
     * Mirrored up on change rather than during render: the parent's state update would otherwise
     * happen while this component is rendering. The cleanup releases the lock if the form unmounts
     * mid-flight for any reason other than a dismissal — the account switching, say.
     */
    useEffect(() => {
        onConfirmingChange(isConfirming)
        return () => onConfirmingChange(false)
    }, [isConfirming, onConfirmingChange])

    const message = errorText ?? (errorKey ? t(errorKey) : null)

    return (
        <form
            data-testid="payment-add-card-form"
            className="flex min-h-0 flex-1 flex-col"
            onSubmit={event => {
                event.preventDefault()
                confirm(setAsDefault)
            }}
        >
            <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
                {/*
                 * `onChange` clears the error rather than leaving it under fields that have since
                 * been corrected: a decline message pinned below a card number the reader has just
                 * fixed reads as a second failure.
                 */}
                <PaymentElement data-testid="payment-stripe-element" onChange={clearError} />
                {/*
                 * `mode: 'billing'` and no phone. The phone number is not something this app stores
                 * or sends anywhere, and legacy does not collect it either — an optional field on a
                 * payment form is a field that costs every reader a decision for nothing.
                 * `AddressElement` brings its own country list, so legacy's hand-built `<select>`
                 * from `CoreModel.getCountries` has nothing left to do.
                 */}
                <AddressElement options={{ mode: 'billing', fields: { phone: 'never' } }} />

                {showDefaultOption && (
                    <div className="flex items-center gap-3">
                        {/* The DS Checkbox root is a `<label>` with no text of its own, so the copy is
                            a sibling `<label htmlFor>` — never nested inside it. Its own doc says so. */}
                        <Checkbox
                            data-testid="payment-add-card-default"
                            id={defaultCheckboxId}
                            checked={setAsDefault}
                            disabled={isConfirming}
                            onChange={event => setSetAsDefault(event.target.checked)}
                        />
                        <label
                            htmlFor={defaultCheckboxId}
                            className="type-dense-default cursor-pointer text-(--text-body)"
                        >
                            {t('payment_card_make_default')}
                        </label>
                    </div>
                )}

                {message && (
                    /*
                     * `role="alert"` so the failure is announced: the reader pressed Save, the dialog
                     * did not close, and without this the only signal is a line of text well below
                     * where their attention is.
                     */
                    <p
                        role="alert"
                        className="type-dense-default m-0 text-(--accents-error-active)"
                    >
                        {message}
                    </p>
                )}
            </div>

            <div className="flex flex-none flex-col gap-3 border-(--separator-default) border-t p-4">
                <div className="flex gap-2 [&>*]:flex-1">
                    <Button
                        data-testid="payment-add-card-cancel"
                        type="button"
                        variant="secondary"
                        size="large"
                        disabled={isConfirming}
                        onClick={onCancel}
                    >
                        {t('common_cancel')}
                    </Button>
                    {/* `accent` — this is the action the screen exists for. `primary` is the neutral
                        press in this design system. */}
                    <Button
                        data-testid="payment-add-card-submit"
                        type="submit"
                        variant="accent"
                        size="large"
                        disabled={isConfirming}
                    >
                        {isConfirming && <Loader className="size-[18px]" />}
                        {t('payment_save_card')}
                    </Button>
                </div>
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
