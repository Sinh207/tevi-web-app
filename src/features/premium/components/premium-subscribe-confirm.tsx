'use client'

import { useTranslation } from '@shared/i18n/use-translation'
import { ConfirmDialog } from '@shared/ui/confirm-dialog'
import { usePremiumPriceFormats } from '../hooks/use-premium-price'
import type { SubscribePremiumFlow } from '../hooks/use-subscribe-premium'
import { PLAN_COPY } from '../lib/plans'

/**
 * "Purchase Tevi Premium?" — the one confirmation in front of the charge, wherever the press came
 * from.
 *
 * ## Why it is a screen-level component and not part of the plan grid
 *
 * There are **two** places to press Subscribe: a plan card, and the benefit dialog's footer. Both
 * are legacy's, and both go through one `useSubscribePremium` created in `PremiumView` — so there is
 * one `pending` package, one busy state, and one dialog. Left inside `PremiumPlans` (where it
 * started) this would have needed a second flow for the benefit dialog, which means two pendings and
 * two confirmations racing to say the same thing about different packages.
 *
 * It is also why the grid is safe to withhold from a member while the dialog is not: the dialog
 * takes the flow as a *nullable* prop, and the plan grid is simply not rendered.
 */
export function PremiumSubscribeConfirm({ flow }: { flow: SubscribePremiumFlow }) {
    const { t } = useTranslation()
    /*
     * **`charge`, not `format`** — the figure the card will be debited, in the currency Stripe will
     * debit it in, rather than the unit the reader has asked to *read* money in.
     *
     * Every price on the page is a display conversion (`usePremiumPrice`, and every other figure in
     * this app), which is legacy's behaviour and the right one for browsing: a creator who set their
     * wallet to dong wants the cards in dong. But this dialog is the last thing between a press and
     * a charge, and its sentence ends "this purchase is non-refundable" — so the number in it has to
     * be the number that leaves the account. Legacy prints the converted one here, which is where a
     * reader in dong is told a price they will never see on their statement.
     *
     * For the overwhelming majority of readers the two strings are identical: `DEFAULT_CURRENCY` is
     * USD and only the wallet's switcher changes it.
     */
    const { charge } = usePremiumPriceFormats()

    /*
     * Mounted only while there is something to confirm, so the dialog cannot outlive the package it
     * is about — the same reason legacy guards it on `confirmPurchase && packageSelected`.
     */
    if (!flow.pending || !flow.pendingPlan) return null

    return (
        <ConfirmDialog
            testId="premium-confirm"
            open
            onOpenChange={open => {
                if (!open) flow.cancel()
            }}
            title={t('premium_confirm_title')}
            /*
             * Legacy's sentence, including "non-refundable" — the reason this step exists. `plan` is
             * the cadence's own name so the sentence names what is being bought ("the Annual of Tevi
             * Premium"), and `price` is the same figure the card showed: re-deriving it here is how
             * the two come to disagree.
             */
            description={t('premium_confirm_body', {
                plan: t(PLAN_COPY[flow.pendingPlan].name),
                price: charge(flow.pending.price, flow.pending.currency),
            })}
            confirmLabel={t('premium_confirm_yes')}
            cancelLabel={t('common_close')}
            onConfirm={flow.confirm}
            /*
             * Disables **both** buttons: the checkout is in flight and the browser is about to leave
             * for Stripe, so offering Cancel would suggest it can still be called off.
             * `ConfirmDialog`'s own doc makes the same argument.
             */
            pending={flow.isBusy}
        />
    )
}
