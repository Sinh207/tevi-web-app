'use client'

import { DialogCloseButton } from '@shared/components/dialog-close-button'
import { useTranslation } from '@shared/i18n/use-translation'
import { Button } from '@shared/ui/button'
import { Dialog, DialogContent, DialogTitle } from '@shared/ui/dialog'
import Link from 'next/link'

/**
 * *You need to finish identity verification before you can withdraw.*
 *
 * The screen's answer to **`verification-required`** — the one 4xx on `POST payout-request/` that is not
 * an error but an unfinished step (`payout-request-errors.ts` has the vocabulary). Legacy raises a dialog
 * for exactly this case and it is the right call: a toast saying "identification level 2 required"
 * leaves somebody with a rejected withdrawal and nowhere to press.
 *
 * So the dialog's job is the **link**. Everything else is one sentence.
 *
 * `/identification` is this app's verification screen, and the path is a literal here rather than an
 * import from `features/identification`: that feature exposes no `routes.ts`, and adding a cross-feature
 * dependency for one string would be the more expensive of the two. If a `routes.ts` lands there, this
 * is the one line to change.
 */
export function PayoutVerificationDialog({
    open,
    onClose,
}: {
    open: boolean
    onClose: () => void
}) {
    const { t } = useTranslation()

    return (
        <Dialog open={open} onOpenChange={next => !next && onClose()}>
            <DialogContent data-testid="payout-request-verify-dialog" className="w-[420px] gap-3">
                <div className="flex items-start justify-between gap-3">
                    <DialogTitle className="type-body-strong pt-2 text-(--text-title)">
                        {t('payout_request_verify_title')}
                    </DialogTitle>
                    <DialogCloseButton onClose={onClose} className="-me-2 -mt-2" />
                </div>
                <p className="type-dense-default m-0 text-(--text-body)">
                    {t('payout_request_verify_body')}
                </p>
                <Button
                    data-testid="payout-request-verify-go"
                    variant="accent"
                    size="large"
                    fullWidth
                    render={<Link href="/identification" />}
                >
                    {t('payout_request_verify_action')}
                </Button>
            </DialogContent>
        </Dialog>
    )
}
