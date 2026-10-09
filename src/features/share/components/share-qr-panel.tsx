'use client'

import { useTranslation } from '@shared/i18n/use-translation'
import { qrImageUrl } from '@shared/lib/qr-image'
import { subTestId } from '@shared/lib/test-id'
import { Button } from '@shared/ui/button'
import { Icon } from '@shared/ui/icon'
import { Skeleton } from '@shared/ui/skeleton'
import Image from 'next/image'
import { useState } from 'react'
import { toast } from 'sonner'

/**
 * The share link as a scannable square — the sheet's second step, not a second dialog.
 *
 * ## Why a step and not a nested dialog
 *
 * Legacy mounts a whole second `ResponsiveModal` over the open sheet — same header, title "Share QR
 * Code", and an X that dismisses it and leaves you back on the sheet. Rendered that way here it
 * would stack a second scrim over the first and give the reader two things to dismiss, for a popup
 * that is the same width in the same place.
 *
 * So it is a step in the one popup, and the header's leading slot carries the way back — `xmark` at
 * the root, `angle-left` here, which is what `DialogScreenHeader` is for and why
 * `docs/DESIGN_SYSTEM.md` §7 puts that control at the start. One press either way; what is gone is
 * the doubled backdrop. `share-dialog.tsx` carries the rest of that argument.
 *
 * ## The code is drawn by the API
 *
 * `qrImageUrl` is the single definition of `/qr/v1/` — round eyes, dot modules, the logo in brand
 * purple — so this code and the one `GetAppDialog` shows are the same drawing. `ChannelEventQrDialog`
 * explains at length why a client-side library is the wrong answer even though it looks cheaper.
 *
 * ## Downloading it needs a fetch, and cannot be an `<a download>`
 *
 * `brand-assets` downloads with a plain anchor, and that works because those files are served from
 * this origin. The QR is served by W_API, and **`download` is ignored on a cross-origin href** —
 * the attribute silently degrades to a navigation, so the reader lands on a bare PNG and has to
 * long-press it. Fetching to a blob is what makes the button do what it says; `revokeObjectURL`
 * runs in the same task, because the click has already been dispatched by then.
 */
export function ShareQrPanel({
    url,
    onCopy,
    testId,
}: {
    /** The minted QR link, or `undefined` while it is being minted. */
    url: string | undefined
    onCopy: () => void
    testId?: string
}) {
    const { t } = useTranslation()
    const [saving, setSaving] = useState(false)

    async function download() {
        if (!url || saving) return
        setSaving(true)
        try {
            const response = await fetch(qrImageUrl(url))
            if (!response.ok) throw new Error(String(response.status))
            const blobUrl = URL.createObjectURL(await response.blob())
            const anchor = document.createElement('a')
            anchor.href = blobUrl
            anchor.download = `tevi-qr-code-${Date.now()}.png`
            document.body.append(anchor)
            anchor.click()
            anchor.remove()
            URL.revokeObjectURL(blobUrl)
        } catch {
            /*
             * Legacy `console.error`s here, which tells the developer and not the person holding
             * the phone. The code is on screen and scannable either way, so the toast says what
             * failed rather than pretending the step is broken.
             */
            toast.error(t('share_qr_download_failed'), { id: 'share-qr' })
        } finally {
            setSaving(false)
        }
    }

    return (
        <div className="flex flex-col items-center gap-4 p-4 pt-5" data-testid={testId}>
            {/*
             * The white plate stays in both themes, on purpose: a camera looks for contrast between
             * dark modules and a light quiet zone, and inverting a QR for dark mode makes it
             * unreadable on many scanners. One of the few places a literal white beats a token —
             * the same call `ChannelEventQrDialog` makes, for the same reason.
             *
             * The hairline and the shadow are for **Light**, where a white plate on a white
             * surface has no edge at all and the code floats with nothing holding it.
             */}
            <div className="rounded-(--radius-xl) bg-white p-4 shadow-sm ring-1 ring-black/5">
                {url ? (
                    /*
                     * `size-[232px]` in CSS as well as the width/height attributes: the endpoint
                     * answers a **300×300** PNG, and the attributes alone only fix the box while the
                     * intrinsic size is unknown. Pinning it means the panel is the same height
                     * whatever the service returns.
                     */
                    <Image
                        src={qrImageUrl(url)}
                        alt=""
                        width={232}
                        height={232}
                        unoptimized
                        className="block size-[232px]"
                        data-testid={subTestId(testId, 'qr')}
                    />
                ) : (
                    /*
                     * **`w`/`h` props, not classes.** `Skeleton` writes its height as an inline
                     * style — 12px by default — and an inline declaration beats any class, so a
                     * size class here draws a 12px bar and the popup jumps when the code arrives.
                     */
                    <Skeleton w={232} h={232} className="rounded-(--radius-sm)" />
                )}
            </div>
            <p className="type-caption-label max-w-[280px] text-balance text-center text-(--text-subtitle)">
                {t('share_qr_hint')}
            </p>
            {/*
             * Two equal halves — `grid`, not flex: `Button` is `shrink-0`, so two flexed buttons
             * push the trailing one off the popup in a long locale. Download is the accent because
             * it is the one thing only this step offers; the link can be copied from the sheet too.
             * Labels truncate rather than wrap, so the row stays one control tall in nine locales.
             */}
            <div className="grid w-full grid-cols-2 gap-2">
                <Button
                    variant="secondary"
                    size="large"
                    className="min-w-0"
                    onClick={onCopy}
                    data-testid={subTestId(testId, 'copy')}
                >
                    <Icon name="link-simple" weight="filled" size={20} aria-hidden />
                    <span className="truncate">{t('share_copy_link')}</span>
                </Button>
                <Button
                    variant="accent"
                    size="large"
                    className="min-w-0"
                    disabled={!url || saving}
                    aria-busy={saving || undefined}
                    onClick={download}
                    data-testid={subTestId(testId, 'submit')}
                >
                    <Icon name="download-arrow-down" size={20} aria-hidden />
                    <span className="truncate">{t('share_qr_download')}</span>
                </Button>
            </div>
        </div>
    )
}
