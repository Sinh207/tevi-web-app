'use client'

import { DialogCloseButton } from '@shared/components/dialog-close-button'
import { useTranslation } from '@shared/i18n/use-translation'
import { Dialog, DialogContent, DialogTitle } from '@shared/ui/dialog'
import { useState } from 'react'
import { PayoutHelpButton } from './payout-help-button'

/**
 * *What is Premium?* — the `?` in the **Fast** card's corner, and legacy's third `IconBtnHelp`
 * (`payoutRequest/…/withdrawOption/common/iconBtnHelp`).
 *
 * ## It is not the sell, and that is why it exists
 *
 * The card already has a dialog: pressing a **locked** Fast card opens `PayoutFastPremiumDialog` — an
 * offer, with a subscribe button and a way past it. This one answers a different question, has no
 * action in it, and legacy shows it on the Fast card **whether or not the reader has Premium**. So the
 * `?` was reproduced as a dead glyph on the reading that the sell covered it; it does not, in two ways:
 *
 * - a Premium member's Fast card is *unlocked*, so nothing on that card opens anything at all, and
 * - the sell says why Fast is worth paying for, while this says what Premium **is** — three bullets
 *   about uploads, storage and support, none of which is about payout speed.
 *
 * The copy is legacy's own, translated in eight of our nine locales already (`ar` is missing it there,
 * so that one is written here).
 *
 * A dialog rather than a tooltip, and the dismiss is `DialogCloseButton` at the trailing edge — the
 * reasons are `PayoutFeeHelp`'s and the DS rule it cites, not restated here.
 */
export function PayoutPremiumHelp() {
    const { t } = useTranslation()
    const [open, setOpen] = useState(false)

    const title = t('payout_request_premium_help_title')

    return (
        <>
            <PayoutHelpButton
                testId="payout-premium-help"
                label={title}
                iconSize={20}
                onPress={() => setOpen(true)}
            />

            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent data-testid="payout-premium-help-panel" className="w-[420px] gap-2">
                    <div className="flex items-start justify-between gap-3">
                        <DialogTitle className="type-body-strong pt-2 text-(--text-title)">
                            {title}
                        </DialogTitle>
                        <DialogCloseButton onClose={() => setOpen(false)} className="-me-2 -mt-2" />
                    </div>
                    {/*
                     * A real `<ul>`. Legacy's is a `Typography component='ul'` whose children are
                     * `component='li'` — the markup is right there and the three sentences are a list
                     * in the comps too, so a screen reader gets "list, 3 items" rather than three
                     * paragraphs.
                     */}
                    <ul className="type-dense-default m-0 flex list-disc flex-col gap-2 ps-5 text-(--text-body)">
                        <li>{t('payout_request_premium_help_1')}</li>
                        <li>{t('payout_request_premium_help_2')}</li>
                        <li>{t('payout_request_premium_help_3')}</li>
                    </ul>
                </DialogContent>
            </Dialog>
        </>
    )
}
