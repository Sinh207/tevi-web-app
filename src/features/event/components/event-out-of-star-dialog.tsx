'use client'

import { GET_STAR_PATH } from '@features/payment/routes'
import { PREMIUM_PATH } from '@features/premium/routes'
import { PremiumBadge } from '@shared/components/premium-badge'
import { Sheen } from '@shared/components/sheen'
import { StarMark } from '@shared/components/star-mark'
import { useTranslation } from '@shared/i18n/use-translation'
import { GIFT_BOB, POP, PREMIUM_SHEEN } from '@shared/lib/motion'
import { cn } from '@shared/lib/utils'
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
 * ## Get more Star opens a new tab, as legacy's does
 *
 * `/get-star` in a new tab rather than the in-app purchase sheet: paying happens beside the
 * broadcast, never over it, so nothing in the session being watched is touched by it. The balance
 * change the top-up makes is still what closes this dialog — `useSustainedFee` sees it.
 *
 * One deliberate difference stays: **no balance chip in the title bar.** Legacy draws its
 * `BtnStar` there; the Get Star page shows the balance and the packages, which is where the figure
 * matters.
 *
 * *Subscribe to Premium* keeps legacy's new tab: `/premium` is a whole screen, and following it in
 * this tab would end the stream. The sentence promises Premium removes the fee, which is legacy's
 * copy verbatim — and **B109** records that legacy in fact charges Premium too.
 */
export function EventOutOfStarDialog({
    open,
    description,
    onClose,
}: {
    open: boolean
    /** The body sentence — the sustained fee's by default; paid chat passes its own. */
    description?: string
    /**
     * Given, the dialog is **dismissable** and *Cancel* closes it — paid chat's case, where
     * nothing is being withheld, only a message not sent. Omitted, it is the sustained fee's wall:
     * no dismissal, and *Cancel* leaves the broadcast. Legacy's `OutOfStar` takes the same
     * `onClose` for the same split.
     */
    onClose?: () => void
}) {
    const { t } = useTranslation()
    const router = useRouter()

    return (
        <Dialog
            open={open}
            // The fee's wall refuses dismissal (a top-up or a trip home); paid chat's closes.
            onOpenChange={next => !next && onClose?.()}
            disablePointerDismissal={!onClose}
        >
            <DialogContent data-testid="event-out-of-star">
                <DialogHeader className="items-center">
                    {/*
                     * The DS dialog's illustration tile — 60×60, 12 radius, the Alert type's
                     * warning tint (`docs`: Figma 50:15797) — carrying the Star this is about, so
                     * the dialog says *what ran out* before a word is read. It pops in with the
                     * card. Same layout as before; this is the one block added above the title.
                     */}
                    <span
                        aria-hidden
                        className={cn(
                            'mb-1 grid size-[60px] place-items-center rounded-[12px] bg-(--accents-warning-bg-active)',
                            POP,
                            '[animation-delay:80ms]',
                        )}
                    >
                        <StarMark size={32} />
                    </span>
                    <DialogTitle>{t('event_studio_out_of_star_title')}</DialogTitle>
                    <DialogDescription>
                        {description ?? t('event_studio_out_of_star_body')}
                    </DialogDescription>
                </DialogHeader>
                {/*
                 * ⚠ **Premium first, as the one filled button.** It is the offer that ends the
                 * fee for good, where a top-up only pays this period — and two violet buttons
                 * stacked (the accent *Get more Star* over a violet Premium) read as one choice
                 * said twice. So Premium wears the Premium surface (the nudge card's gradient, a
                 * gold hairline, `PREMIUM_SHEEN`) with the Premium mark throwing off its sparks
                 * (`PremiumBadge`); *Get more Star* steps down to
                 * the outlined button, its Star drifting; *Cancel* is the text button below, at the same size.
                 * Legacy lists the top-up first; this order is a deliberate divergence.
                 */}
                <DialogFooter className="flex-col gap-2 sm:flex-col">
                    <Button
                        data-testid="event-out-of-star-premium"
                        variant="accent"
                        size="large"
                        fullWidth
                        render={<Link href={PREMIUM_PATH} target="_blank" rel="noopener" />}
                        className={cn(
                            'relative overflow-hidden text-white',
                            'bg-[linear-gradient(135deg,#2A0A7A_0%,#4B00E0_55%,#9B5CFF_100%)] hover:brightness-110',
                            'shadow-[0_6px_18px_rgba(75,0,224,0.4)] ring-1 ring-inset ring-[#F2DF89]/50',
                        )}
                    >
                        <Sheen strength="bright" />
                        {/*
                         * The app's own Premium mark, **with its spark burst** — twelve sparkles
                         * shooting off the crown (`PREMIUM_SPARK`), the motion every crown in the
                         * product carries. `aria-hidden`: the label beside it says Premium.
                         */}
                        <span aria-hidden className="relative flex flex-none">
                            <PremiumBadge size={22} />
                        </span>
                        <span className="relative">{t('event_studio_out_of_star_premium')}</span>
                    </Button>
                    <Button
                        data-testid="event-out-of-star-get"
                        variant="secondary"
                        size="large"
                        fullWidth
                        // A new tab, so topping up never touches the broadcast being watched — the
                        // same reason Premium above opens one.
                        render={<Link href={GET_STAR_PATH} target="_blank" rel="noopener" />}
                    >
                        <span className={cn('flex', GIFT_BOB)}>
                            <StarMark size={20} />
                        </span>
                        {t('event_studio_out_of_star_get')}
                    </Button>
                    <Button
                        data-testid="event-out-of-star-leave"
                        variant="ghost"
                        size="large"
                        fullWidth
                        onClick={onClose ?? (() => router.push('/'))}
                    >
                        {t('event_studio_out_of_star_leave')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
