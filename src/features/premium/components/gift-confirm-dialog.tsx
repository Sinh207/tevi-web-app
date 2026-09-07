'use client'

import { useTranslation } from '@shared/i18n/use-translation'
import { ConfirmDialog } from '@shared/ui/confirm-dialog'
import { giftRecipientName } from '../api/gift-types'
import type { GiftPremiumFlow } from '../hooks/use-gift-premium'
import { usePremiumPriceFormats } from '../hooks/use-premium-price'
import { GIFT_PLAN_COPY } from '../lib/gift-plans'

/**
 * "Gift 12 months of Tevi Premium to Ada?" — the one confirmation in front of the charge.
 *
 * ## Why the step exists at all
 *
 * Legacy interposes it, and its sentence says why: *this purchase is non-refundable*. On this screen
 * the stake is higher than on `/premium` — the money is spent on **somebody else's** account, so a
 * mis-pressed card cannot be undone by the person who pressed it. The second press is the point.
 *
 * ## `charge`, not `format` — the figure that leaves the account
 *
 * Every price *on* the page is a display conversion into whatever currency the reader picked in the
 * wallet, which is legacy's behaviour and the right one for browsing. This dialog is the last thing
 * between a press and a charge, and its sentence ends "non-refundable", so the number in it has to
 * be the number Stripe will take. Legacy prints the converted one here, which is where a reader in
 * dong is told a price they will never see on their statement.
 *
 * For the overwhelming majority of readers the two strings are identical: `DEFAULT_CURRENCY` is USD
 * and only the wallet's switcher changes it. `usePremiumPriceFormats` documents the pair.
 *
 * ## It is mounted only while there is something to confirm
 *
 * So the dialog cannot outlive the package it is about — the same reason legacy guards its own on
 * `confirmPurchase && packageSelected`, and the reason `flow.pending` is nullable rather than a
 * boolean beside a package that may or may not still be there.
 */
export function GiftConfirmDialog({ flow }: { flow: GiftPremiumFlow }) {
    const { t } = useTranslation()
    const { charge } = usePremiumPriceFormats()

    /*
     * **Not while the error dialog is up.** `confirm()` leaves `pending` set on a pre-charge failure
     * — deliberately, so the confirmation is there to try again from — but rendering both put *two*
     * `role="dialog"` in the tree at once, each with its own focus trap and scroll lock. Measured: a
     * failed receiver lookup produced two stacked modals.
     *
     * The confirmation is not lost, only hidden: dismissing the error clears `errorKey` and it comes
     * straight back, with the same package still pending.
     */
    if (flow.errorKey) return null
    if (!flow.pending || !flow.pendingPlan || !flow.recipient) return null

    const plan = t(GIFT_PLAN_COPY[flow.pendingPlan].name)
    /*
     * The display name where there is one, else the handle — never an empty string dropped into the
     * middle of a sentence. `normalizeGiftRecipients` guarantees the slug, so `who` always names
     * somebody.
     */
    const who = giftRecipientName(flow.recipient) || `@${flow.recipient.slug}`

    return (
        <ConfirmDialog
            testId="premium-gift-confirm"
            open
            onOpenChange={open => {
                if (!open) flow.cancel()
            }}
            title={t('giftpremium_confirm_title', { plan, name: who })}
            description={t('giftpremium_confirm_body', {
                name: who,
                plan,
                price: charge(flow.pending.price, flow.pending.currency),
            })}
            confirmLabel={t('giftpremium_confirm_yes')}
            cancelLabel={t('common_close')}
            onConfirm={flow.confirm}
            /*
             * Disables **both** buttons. Between "Yes" and the browser leaving for Stripe there is a
             * receiver-id lookup and a checkout request, and offering Cancel through either would
             * suggest the charge can still be called off. `ConfirmDialog`'s own doc makes the same
             * argument; `flow.isBusy` covers the lookup as well as the checkout, which is why it is
             * one flag rather than two.
             */
            pending={flow.isBusy}
        />
    )
}

/**
 * The other dialog this screen can raise: **something failed before any money moved.**
 *
 * A separate surface from the confirmation and from `features/payment`'s `CheckoutStatusDialog`, and
 * that separation is the whole point. A recipient whose user id cannot be resolved is not a payment
 * problem — nothing was charged, nothing is pending, and a dialog headed by a payment error would
 * describe the wrong event and offer a "retry payment" that has nothing to retry.
 *
 * A 4xx from `checkout/` itself, including legacy's special-cased 422 ("this user already has Tevi
 * Premium"), is **not** handled here: `useCheckout` puts the backend's own sentence on the machine
 * and the payment feature's dialog prints it, which is `docs/API_ERRORS.md`'s rule. Hard-coding one
 * reason — as legacy does — describes every other 422 wrongly.
 */
export function GiftErrorDialog({ flow }: { flow: GiftPremiumFlow }) {
    const { t } = useTranslation()

    if (!flow.errorKey) return null

    return (
        <ConfirmDialog
            testId="premium-gift-error-dialog"
            open
            onOpenChange={open => {
                if (!open) flow.dismissError()
            }}
            title={t('giftpremium_error_title')}
            description={t(flow.errorKey)}
            /*
             * One button, and it is the dismissal. There is nothing to confirm: the reader is
             * already standing on the confirmation they can press again, and a second "Try again"
             * here would be the same press behind an extra dialog.
             */
            confirmLabel={t('common_close')}
            onConfirm={flow.dismissError}
        />
    )
}
