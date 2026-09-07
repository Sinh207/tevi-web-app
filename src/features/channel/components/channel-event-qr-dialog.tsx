'use client'

import { useTranslation } from '@shared/i18n/use-translation'
import { qrImageUrl } from '@shared/lib/qr-image'
import { Dialog, DialogContent, DialogTitle } from '@shared/ui/dialog'
import Image from 'next/image'
import type { ChannelEvent } from '../api/events-api'

/**
 * "Get QR Code" — the event's share link as a scannable square.
 *
 * ## Drawn by the API, like every other QR in this app
 *
 * This used to generate the code in the browser with `qrcode.react`, on the reasoning that it saved
 * a round trip and could not fail. What that argument missed is what the endpoint actually returns:
 * `/qr/v1/` draws **Tevi's** code — round eyes, dot modules, the logo in brand purple through the
 * middle — and the library draws an anonymous black square. These end up on posters and stream
 * overlays beside codes from `GetAppDialog`, which never stopped using the API, so the app was
 * shipping two different-looking QRs for one product.
 *
 * `qrImageUrl` is now the one place that endpoint is named, and `qrcode.react` is gone from the
 * dependencies with this file.
 *
 * ## The URL is the one the Share row copies
 *
 * Both come from `eventShareUrl`, so a scanned code and a pasted link can never point at different
 * places — the sort of thing that only shows up after someone has printed the poster.
 */
export function ChannelEventQrDialog({
    event,
    url,
    open,
    onOpenChange,
}: {
    event: ChannelEvent
    url: string
    open: boolean
    onOpenChange: (open: boolean) => void
}) {
    const { t } = useTranslation()

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-[320px]">
                <div className="flex min-w-0 flex-col items-center gap-3 text-center">
                    <DialogTitle className="type-body-strong min-w-0 text-(--text-title)">
                        {event.title ?? t('channel_event_untitled')}
                    </DialogTitle>
                    {/*
                     * White plate under the code, in both themes and on purpose. A QR is read by a
                     * camera looking for high contrast between dark modules and a light quiet zone;
                     * inverting it for dark mode makes it unscannable on many readers. This is one
                     * of the few places a literal white is correct rather than a token.
                     */}
                    <div className="rounded-(--radius-lg) bg-white p-3">
                        {/*
                         * `unoptimized`, as in `GetAppDialog`: the API already renders one PNG per
                         * URL, so there is nothing for the optimiser to resize, and skipping it
                         * keeps the API host out of `remotePatterns` — that list is the set of
                         * hosts the optimiser may *fetch*, not the set a page may link to.
                         *
                         * `alt=""` rather than a description: unlike the get-the-app dialog, the
                         * destination is printed underneath as selectable text, so naming the image
                         * would announce the same URL twice.
                         */}
                        <Image
                            src={qrImageUrl(url)}
                            alt=""
                            width={200}
                            height={200}
                            unoptimized
                            className="block"
                        />
                    </div>
                    <p className="type-caption-meta min-w-0 break-all text-(--text-subtitle)">
                        {url}
                    </p>
                </div>
            </DialogContent>
        </Dialog>
    )
}
