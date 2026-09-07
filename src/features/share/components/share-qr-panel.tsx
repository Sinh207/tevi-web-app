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
        // `gap 16`, `padding 12` and `paddingBottom 8` — legacy's, and centred as it centres.
        <div className="flex flex-col items-center gap-4 p-3 pb-2" data-testid={testId}>
            {/*
             * 250px, which is legacy's. The one addition is the white plate under it, in both
             * themes and on purpose: a camera looks for contrast between dark modules and a light
             * quiet zone, and inverting a QR for dark mode makes it unreadable on many scanners.
             * Legacy has no plate because it has no dark mode. One of the few places a literal
             * white beats a token — the same call `ChannelEventQrDialog` makes, for the same reason.
             */}
            <div className="rounded-(--radius-lg) bg-white p-3">
                {url ? (
                    /*
                     * `size-[250px]` in CSS as well as the width/height attributes: the endpoint
                     * answers a **300×300** PNG, and the attributes alone only fix the box while the
                     * intrinsic size is unknown. Pinning it means the panel is the same height
                     * whatever the service returns.
                     */
                    <Image
                        src={qrImageUrl(url)}
                        alt=""
                        width={250}
                        height={250}
                        unoptimized
                        className="block size-[250px]"
                        data-testid={subTestId(testId, 'qr')}
                    />
                ) : (
                    /*
                     * **`w`/`h` props, not classes.** `Skeleton` writes its height as an inline
                     * style — 12px by default, the DS bar — and an inline declaration beats any
                     * class, so `size-[250px]` here drew a **12px** bar: the popup opened 206 tall
                     * and jumped to 444 the moment the code arrived, re-centring itself on the way.
                     * Its own docstring warns about exactly this ("reserve the row at its real
                     * height"); the class form fails silently because the width still works.
                     */
                    <Skeleton w={250} h={250} className="rounded-(--radius-sm)" />
                )}
            </div>
            {/* 16/400, centred, title ink — legacy's `#131313`. */}
            <p className="type-body-default text-center text-(--text-title)">
                {t('share_qr_hint')}
            </p>
            <div className="flex w-full items-center gap-2">
                {/*
                 * Both controls are legacy's `#131313`, i.e. the DS `primary` — the neutral press,
                 * not `accent`: neither is the brand action, they are two ways of taking the code
                 * away with you. 40px in the comps, `medium` (36) here, because a DS size beats a
                 * number that is between two of them.
                 *
                 * `flex-1` and not the Button's own `fullWidth`: that is `w-full`, which in a row
                 * beside a second control resolves to 100% of the row and pushes the download
                 * square out past the popup's edge — visible only once both are rendered, which is
                 * why it survived being read.
                 */}
                <Button
                    variant="primary"
                    size="medium"
                    className="min-w-0 flex-1"
                    onClick={onCopy}
                    data-testid={subTestId(testId, 'copy')}
                >
                    <Icon name="link-simple" weight="filled" size={18} aria-hidden />
                    {t('share_copy_link')}
                </Button>
                <Button
                    variant="primary"
                    size="medium"
                    iconOnly
                    disabled={!url || saving}
                    aria-label={t('share_qr_download')}
                    onClick={download}
                    data-testid={subTestId(testId, 'submit')}
                >
                    <Icon name="download-arrow-down" size={18} aria-hidden />
                </Button>
            </div>
        </div>
    )
}
