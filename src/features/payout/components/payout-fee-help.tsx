'use client'

import { DialogCloseButton } from '@shared/components/dialog-close-button'
import { useTranslation } from '@shared/i18n/use-translation'
import { Dialog, DialogContent, DialogTitle } from '@shared/ui/dialog'
import { useState } from 'react'
import { PayoutHelpButton } from './payout-help-button'

/**
 * The `?` beside a fee label — legacy's `iconBtnHelpWithdrawFee` and `iconBtnHelpTransactionFee`.
 *
 * Two of the three help controls legacy ships in this feature, and they belong here rather than on the
 * balance: a creator reading a fee breakdown is being told money was taken, and *why* is the question
 * that raises. Legacy's own copy answers it — the payout fee runs the platform, the transaction fee
 * goes to a third-party processor — and that distinction is the entire reason there are two lines
 * rather than one.
 *
 * A dialog, not a tooltip, for the reason `BalanceHelpButton` gives: the copy is a sentence or two,
 * a touch cannot dismiss a tooltip without also hitting what is under it, and a screen reader loses it
 * the moment focus moves.
 *
 * `stopPropagation` on the trigger, as legacy has: this control sits inside a `<summary>`, so without
 * it a press would toggle the disclosure **and** open the dialog. That — and the `aria-label` — is why
 * the `?` itself is `PayoutHelpButton` rather than a local `Button`; see that file.
 *
 * **Both screens use it.** The withdraw *detail* rows and the request screen's own summary block print
 * the same two fees, and legacy hangs the same two dialogs off both (`iconBtnHelpWithdrawFee` /
 * `iconBtnHelpTransactionFee`, imported by `withdrawDetail/…/detail` and by
 * `payoutRequest/…/withdrawalSummary` alike). The request summary shipped with the glyph drawn but
 * dead, on the reading that legacy's copy did not exist — it does, and it is this copy.
 */
export function PayoutFeeHelp({ kind }: { kind: 'withdraw' | 'transaction' }) {
    const { t } = useTranslation()
    const [open, setOpen] = useState(false)

    const title =
        kind === 'withdraw'
            ? t('payout_fee_help_withdraw_title')
            : t('payout_fee_help_transaction_title')
    const body =
        kind === 'withdraw'
            ? t('payout_fee_help_withdraw_body')
            : t('payout_fee_help_transaction_body')

    return (
        <>
            {/* The trigger — and both of the things that make it correct next to a `<summary>` — is
                `PayoutHelpButton`, shared with the option card's own `?`. */}
            <PayoutHelpButton
                testId="payout-fee-help"
                label={title}
                onPress={() => setOpen(true)}
            />

            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent className="w-[420px] gap-2">
                    {/*
                     * Title and dismiss on one row. There is no decision in this dialog, so there is no
                     * footer button — see `DialogCloseButton` for the rule and for why legacy's "no
                     * control at all" is not the answer either.
                     *
                     * `-me-2 -mt-2` pulls the 40px target into the dialog's own padding, so the glyph
                     * sits where the corner is rather than 8px inside it.
                     */}
                    <div className="flex items-start justify-between gap-3">
                        <DialogTitle className="type-body-strong pt-2 text-(--text-title)">
                            {title}
                        </DialogTitle>
                        <DialogCloseButton onClose={() => setOpen(false)} className="-me-2 -mt-2" />
                    </div>
                    <p className="type-dense-default m-0 text-(--text-body)">{body}</p>
                </DialogContent>
            </Dialog>
        </>
    )
}
