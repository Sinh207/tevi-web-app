'use client'

import { useRequireStars } from '@features/balance'
import { PREMIUM_PATH } from '@features/premium/routes'
import { useTranslation } from '@shared/i18n/use-translation'
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
import { useRouter } from 'next/navigation'

/**
 * **Out of Star** — the sustained fee came due and the balance could not cover it.
 *
 * Legacy's `components/dialogs/outOfStar`, opened by `useChargeStar` when a tick finds the balance
 * under the fee, and it is a **wall**, not a notice: no scrim press, no Escape
 * (`backdropClick={false}`, `disableEscapeKeyDown`). The reader either tops up, or leaves — legacy's
 * *Cancel* is `router.push('/')`, and it is the only way out. Watching on while the fee is unpaid is
 * the one outcome the dialog exists to prevent.
 *
 * It closes itself: `useSustainedFee` clears `isOutOfStar` the moment the balance covers the fee,
 * and collects the missed period as it does.
 *
 * ## Two deliberate differences
 *
 * - **Get more Star opens the purchase sheet in place** (`useRequireStars`, the app's one
 *   shortfall path) rather than legacy's `/get-star` in a new tab — the sheet is `z-50` over the
 *   studio, so the reader tops up without leaving the broadcast, and the balance change is what
 *   closes this dialog.
 * - **No balance chip in the title bar.** Legacy draws its `BtnStar` there; the purchase sheet this
 *   opens shows the balance and the gap, which is the figure that matters at this moment.
 *
 * *Subscribe to Premium* keeps legacy's new tab: `/premium` is a whole screen, and following it in
 * this tab would end the stream. The sentence promises Premium removes the fee, which is legacy's
 * copy verbatim — and **B109** records that legacy in fact charges Premium too.
 */
export function EventOutOfStarDialog({ open, fee }: { open: boolean; fee: number | null }) {
    const { t } = useTranslation()
    const router = useRouter()
    const requireStars = useRequireStars()

    return (
        <Dialog
            open={open}
            // Refused, as legacy's is: closing this is either a top-up or a trip home.
            onOpenChange={() => {}}
            disablePointerDismissal
        >
            <DialogContent data-testid="event-out-of-star">
                <DialogHeader>
                    <DialogTitle>{t('event_studio_out_of_star_title')}</DialogTitle>
                    <DialogDescription>{t('event_studio_out_of_star_body')}</DialogDescription>
                </DialogHeader>
                <DialogFooter className="flex-col gap-2 sm:flex-col">
                    <Button
                        data-testid="event-out-of-star-get"
                        variant="accent"
                        size="large"
                        fullWidth
                        // `fee` is the amount this period needs; the sheet works out the gap.
                        onClick={requireStars(fee ?? 1, () => {})}
                    >
                        {t('event_studio_out_of_star_get')}
                    </Button>
                    <Button
                        data-testid="event-out-of-star-premium"
                        variant="secondary"
                        size="large"
                        fullWidth
                        render={<Link href={PREMIUM_PATH} target="_blank" rel="noopener" />}
                    >
                        {t('event_studio_out_of_star_premium')}
                    </Button>
                    <Button
                        data-testid="event-out-of-star-leave"
                        variant="ghost"
                        size="large"
                        fullWidth
                        onClick={() => router.push('/')}
                    >
                        {t('event_studio_out_of_star_leave')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
