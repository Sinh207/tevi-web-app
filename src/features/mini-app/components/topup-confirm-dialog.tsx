'use client'

import { useTranslation } from '@shared/i18n/use-translation'
import { formatStarAmount } from '@shared/lib/money'
import { Button } from '@shared/ui/button'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@shared/ui/dialog'
import Link from 'next/link'

/**
 * "Spending 500 Stars?" — the one confirmation a mini app can raise.
 *
 * ## Why a top-up is confirmed and a purchase is not
 *
 * `buyItem` is the reader pressing "buy" **inside** the app, on a screen that named the item and its
 * price. A second dialog from the host would be a double confirmation of something already
 * confirmed. `topup` is different: it moves Star out of the Tevi account and into the app's own
 * wallet, where Tevi's ledger stops explaining it. Legacy draws the line in the same place, and it
 * is the right one — the host confirms leaving the platform's money, not spending inside it.
 *
 * The amount is the app's, and it is shown **verbatim** in the sentence the reader agrees to. That
 * is why `api/types.ts` refuses a non-integer, negative or absurd `amount` before this renders: a
 * dialog that can display `NaN Stars` cannot be the record of what somebody agreed to.
 *
 * ## Not `ConfirmDialog`
 *
 * That component is title + one line + two buttons, and this needs a third block — the terms line,
 * with a link in it. Legacy has the same line and the same link. Composed from the same `Dialog`
 * primitives so the geometry stays the DS's.
 */
export function TopupConfirmDialog({
    amount,
    pending,
    onConfirm,
    onCancel,
}: {
    /** `null` when nothing is pending — which is what closes it. */
    amount: number | null
    pending: boolean
    onConfirm: () => void
    onCancel: () => void
}) {
    const { t, currentLanguage } = useTranslation()

    return (
        <Dialog
            open={amount !== null}
            /*
             * Escape and the scrim both mean cancel, and cancel is a **reply** — the mini app is
             * waiting on this exchange, so dismissing the dialog has to tell it, not just close.
             * `pending` blocks that: mid-deposit there is nothing to cancel any more.
             */
            onOpenChange={open => {
                if (!open && !pending) onCancel()
            }}
        >
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>
                        {t('miniapp_topup_heading', {
                            amount: formatStarAmount(amount ?? 0, currentLanguage),
                        })}
                    </DialogTitle>
                    <DialogDescription>{t('miniapp_topup_body')}</DialogDescription>
                </DialogHeader>

                <p className="type-caption-meta text-center text-(--text-body)">
                    {t('miniapp_topup_terms_prefix')} {/*
                     * A real link, opened in a new tab: the reader is being asked to agree to
                     * something and must be able to read it **without** losing the dialog — and
                     * losing it would also cancel the app's request behind their back.
                     */}
                    <Link
                        data-testid="mini-app-topup-terms"
                        href="/terms"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-(--text-link) underline hover:no-underline"
                    >
                        {t('miniapp_topup_terms_link')}
                    </Link>
                </p>

                <DialogFooter layout="side-by-side">
                    {/* Cancel first in the DOM, so focus and Escape land on it — `ConfirmDialog`'s rule. */}
                    <Button
                        data-testid="mini-app-topup-cancel"
                        variant="secondary"
                        size="large"
                        disabled={pending}
                        onClick={onCancel}
                    >
                        {t('common_cancel')}
                    </Button>
                    <Button
                        data-testid="mini-app-topup-confirm"
                        variant="accent"
                        size="large"
                        disabled={pending}
                        onClick={onConfirm}
                    >
                        {t('miniapp_topup_confirm')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
