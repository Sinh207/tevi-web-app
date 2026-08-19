'use client'

import { useTranslation } from '@shared/i18n/use-translation'
import { Dialog, DialogContent, DialogTitle } from '@shared/ui/dialog'
import { QRCodeSVG } from 'qrcode.react'
import type { ChannelEvent } from '../api/events-api'

/**
 * "Get QR Code" — the event's share link as a scannable square.
 *
 * ## Generated here, not fetched
 *
 * Legacy asks the backend for a PNG: `${W_API}/qr/v1/?text=…`. That endpoint is still live (verified,
 * 200, ~13 KB), so this is a deliberate change of source rather than a workaround.
 *
 * `qrcode.react` was **already a dependency of this repo and used by nothing**, so the bundle cost is
 * either already paid or was always going to be. Against a network round-trip it buys: no loading
 * state, no failure state, an SVG that stays crisp when someone points a camera at a laptop screen,
 * and no dependency on `/qr/v1/` outliving the page. The QR encodes a public URL either way, so
 * there is no privacy difference.
 *
 * ## The URL is the one the Share row copies
 *
 * Both come from `eventShareUrl` so a scanned code and a pasted link can never point at different
 * places — which is the sort of thing that only shows up after someone has printed the poster.
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
                     * inverting it for dark mode makes it unscannable on many readers. `--white` and
                     * a literal black are the two colours here that must not follow the theme.
                     */}
                    <div className="rounded-(--radius-lg) bg-white p-3">
                        <QRCodeSVG value={url} size={200} level="M" marginSize={0} />
                    </div>
                    <p className="type-caption-meta min-w-0 break-all text-(--text-subtitle)">
                        {url}
                    </p>
                </div>
            </DialogContent>
        </Dialog>
    )
}
