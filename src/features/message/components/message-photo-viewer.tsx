'use client'

import { DialogCloseButton } from '@shared/components/dialog-close-button'
import { useTranslation } from '@shared/i18n/use-translation'
import { Button } from '@shared/ui/button'
import { Dialog, DialogContent, DialogTitle } from '@shared/ui/dialog'
import { Icon } from '@shared/ui/icon'
import Image from 'next/image'
import { type KeyboardEvent, useState } from 'react'

/**
 * A message's photos, full screen — legacy's `messageList/viewImage`, without its per-photo
 * Reply / Delete / Download bar (those act on the *message* and are on the bubble already).
 *
 * Its own small viewer rather than `features/post`'s lightbox: that one is the post card's (it
 * draws the post's author and actions over the media, and the post feature keeps it internal on
 * purpose). A chat photo has none of that — one image, the next one, close.
 *
 * Arrow keys page in reading order, as the buttons do: under `ar` the next photo is to the left.
 */
export function MessagePhotoViewer({
    urls,
    startIndex,
    onClose,
}: {
    urls: string[]
    startIndex: number
    onClose: () => void
}) {
    const { t } = useTranslation()
    const [index, setIndex] = useState(() => Math.min(Math.max(startIndex, 0), urls.length - 1))
    const many = urls.length > 1
    const go = (delta: number) => setIndex(current => (current + delta + urls.length) % urls.length)

    const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
        if (!many) return
        const forward = getComputedStyle(event.currentTarget).direction === 'rtl' ? -1 : 1
        if (event.key === 'ArrowRight') go(forward)
        else if (event.key === 'ArrowLeft') go(-forward)
    }

    const url = urls[index]

    return (
        <Dialog
            open
            onOpenChange={open => {
                if (!open) onClose()
            }}
        >
            <DialogContent
                data-testid="message-photo-viewer"
                onKeyDown={onKeyDown}
                className="h-dvh max-h-dvh w-screen max-w-none gap-0 rounded-none border-0 bg-(--opacity-black-75) p-0 shadow-none"
            >
                <DialogTitle className="sr-only">{t('message_photo_viewer_title')}</DialogTitle>
                <div className="relative flex min-h-0 flex-1 items-center justify-center p-4">
                    {url && (
                        <Image
                            src={url}
                            alt=""
                            fill
                            sizes="100vw"
                            className="object-contain"
                            priority
                        />
                    )}
                </div>
                {many && (
                    <>
                        <Button
                            data-testid="message-photo-viewer-prev"
                            variant="secondary"
                            size="large"
                            iconOnly
                            aria-label={t('common_previous')}
                            onClick={() => go(-1)}
                            className="absolute top-1/2 start-4 -translate-y-1/2 rounded-(--radius-fill)"
                        >
                            <Icon name="angle-left" size={24} className="size-6 rtl:rotate-180" />
                        </Button>
                        <Button
                            data-testid="message-photo-viewer-next"
                            variant="secondary"
                            size="large"
                            iconOnly
                            aria-label={t('common_next')}
                            onClick={() => go(1)}
                            className="absolute top-1/2 end-4 -translate-y-1/2 rounded-(--radius-fill)"
                        >
                            <Icon name="angle-right" size={24} className="size-6 rtl:rotate-180" />
                        </Button>
                        <p
                            aria-live="polite"
                            className="absolute inset-x-0 bottom-6 mx-auto w-fit rounded-(--radius-fill) bg-(--opacity-black-50) px-3 py-1 type-caption-meta text-(--white)"
                        >
                            {index + 1} / {urls.length}
                        </p>
                    </>
                )}
                {/* Last in the DOM, so initial focus does not land on the way out (DESIGN_SYSTEM §7). */}
                <DialogCloseButton
                    data-testid="message-photo-viewer-close"
                    className="absolute end-2 top-2 text-(--white)"
                />
            </DialogContent>
        </Dialog>
    )
}
