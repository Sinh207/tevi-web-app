'use client'

import { GET_STAR_PATH } from '@features/payment/routes'
import { StarMark } from '@shared/components/star-mark'
import { useTranslation } from '@shared/i18n/use-translation'
import { POP } from '@shared/lib/motion'
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

/**
 * **Not enough Stars** — what a gift press meets when the balance cannot cover it.
 *
 * Legacy's `notAnoughStars`: a title, its sentence, and *Get more Star*. Before this the press
 * went straight to the purchase sheet, which skipped the one thing the reader needed told — *why*
 * nothing was sent — and dropped them into a payment form they had not asked for.
 *
 * Drawn as the studio's other Star wall (`EventOutOfStarDialog`) is: the DS dialog with its
 * illustration tile, the Star in it, and the same two-step order. Unlike that one it is
 * **dismissable** — nothing is being withheld here, a gift simply was not sent, so Cancel and a
 * click outside both close it.
 *
 * *Get more Star* opens `/get-star` in a **new tab**, as legacy's does — the top-up happens
 * beside the broadcast rather than over it, so nothing about the session the reader is watching
 * (the stream, the socket, the chat) is touched by paying.
 */
export function EventNotEnoughStarsDialog({
    open,
    onClose,
}: {
    open: boolean
    onClose: () => void
}) {
    const { t } = useTranslation()

    return (
        <Dialog open={open} onOpenChange={next => !next && onClose()}>
            <DialogContent data-testid="event-not-enough-stars">
                <DialogHeader className="items-center">
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
                    <DialogTitle>{t('event_gift_not_enough_title')}</DialogTitle>
                    <DialogDescription>{t('event_gift_not_enough_body')}</DialogDescription>
                </DialogHeader>
                <DialogFooter className="flex-col gap-2 sm:flex-col">
                    <Button
                        data-testid="event-not-enough-stars-get"
                        variant="accent"
                        size="large"
                        fullWidth
                        render={<Link href={GET_STAR_PATH} target="_blank" rel="noopener" />}
                        onClick={onClose}
                    >
                        <StarMark size={20} />
                        {t('event_studio_out_of_star_get')}
                    </Button>
                    <Button
                        data-testid="event-not-enough-stars-cancel"
                        variant="ghost"
                        size="large"
                        fullWidth
                        onClick={onClose}
                    >
                        {t('common_cancel')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
