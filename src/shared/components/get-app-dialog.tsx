'use client'

import { DialogCloseButton } from '@shared/components/dialog-close-button'
import { StoreBadge } from '@shared/components/store-badge'
import { env } from '@shared/config/env'
import { useTranslation } from '@shared/i18n/use-translation'
import { qrImageUrl } from '@shared/lib/qr-image'
import { useWebConfig } from '@shared/lib/remote-config'
import { subTestId } from '@shared/lib/test-id'
import { Button } from '@shared/ui/button'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@shared/ui/dialog'
import Image from 'next/image'
import type { ReactNode } from 'react'

/**
 * "Scan this to get the app" — one dialog, two callers.
 *
 * The rail's **Get App** button opens it with the generic copy; the **Lucky Wheel** card opens the
 * same dialog with the campaign's own title and body, because the campaign's ask is the same ask:
 * the wheel only spins in the native app.
 *
 * ## What legacy does instead, and why this does not
 *
 * Legacy has two of these. `dialogs/shareQr` is this one. The Lucky Wheel has its own full-bleed
 * take — an orange gradient, three raster wheel images, and headline text at `fontWeight: 900`,
 * italic, under an eight-shadow white outline.
 *
 * That treatment is **not ported**, and not by oversight: the design system's type scale is 25
 * styles topping out at 700, CLAUDE.md forbids setting `font-size` and `font-weight` by hand, and
 * the app does not load a Black weight of Inter for it to use. Reproducing it would mean going
 * around the DS for one dialog. The campaign's *copy* survives — which is the part that tells a
 * creator what the wheel is — and the art needs a designer, not a closer approximation.
 *
 * ## The two store links come from remote config
 *
 * `download.ios.link` / `download.android.link`, the same fields legacy reads, via
 * `useWebConfig()`. They are never absent: the feature's own fallback for those two fields *is*
 * the public listing URL, so this renders a working button before Firebase has answered and if
 * Firebase never answers — see `features/remote-config/api/types.ts`.
 *
 * They are read rather than hard-coded because a store link is the one thing here that has to be
 * changeable without a deploy: an app pulled and relisted, a regional storefront, a switch to a
 * OneLink. This file used to hold them as constants with a note saying that if they ever had to
 * move without a deploy, that would be the moment to add remote config. That moment came with
 * `features/remote-config`.
 *
 * ## The QR is server-rendered
 *
 * `qrImageUrl` — the same endpoint legacy uses, and the only place it is named. It returns Tevi's
 * branded code rather than a plain one, which is why no QR library belongs in the bundle.
 *
 * The store buttons are the standard badges — brand mark, "Download on the", store name — built
 * from `StoreBadge`, which explains why those two marks are inline SVG rather than sprite glyphs.
 */
export function GetAppDialog({
    open,
    onOpenChange,
    title,
    body,
    testId,
}: {
    open: boolean
    onOpenChange: (open: boolean) => void
    /** Defaults to the generic "Get the Tevi app". */
    title?: ReactNode
    body?: ReactNode
    /**
     * Base `data-testid`. Derives `-title`, `-qr`, `-close`, `-overlay` (from `DialogContent`), and
     * `-stores-ios` / `-stores-android` via `StoreButtons`.
     *
     * The two store badges inline their names rather than taking a companion attribute, because
     * `ios` and `android` are a closed enum written in this source file — the one case where the
     * catalog can enumerate every id, so inlining costs nothing. See `shared/lib/test-id.ts`.
     */
    testId?: string
}) {
    const { t } = useTranslation()

    const target = env.NEXT_PUBLIC_BASE_URL
    const qrSrc = qrImageUrl(target)

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent data-testid={testId}>
                {/* `DialogTitle` and `DialogDescription` carry the DS's own type and ink
                    (`type-body-strong` / `type-dense-default`). Restating them here — which this
                    file used to do — silently makes one dialog a different size from every other
                    one in the app. */}
                {/* `px-6` keeps the centred title clear of the close button in the corner. It
                    matters here and not on the app's other dialogs because this title can be a
                    **campaign name** — server data of no fixed length, passed in by the Lucky
                    Wheel card — rather than a string we wrote and can see. */}
                <DialogHeader className="px-6">
                    <DialogTitle data-testid={subTestId(testId, 'title')}>
                        {title ?? t('rail_qr_title')}
                    </DialogTitle>
                    <DialogDescription>{body ?? t('rail_qr_body')}</DialogDescription>
                </DialogHeader>

                <div className="flex justify-center">
                    {/* A white plate under the code: a QR needs a light quiet zone to scan, and
                        the dialog's surface is near-black in dark mode. Legacy uses a 28 radius;
                        this is the DS's 24, because inventing a radius for one plate is not worth
                        stepping outside the ramp. */}
                    <div className="rounded-2xl bg-white p-3">
                        {/* `unoptimized`: the QR is generated per-URL by the API, so there is
                            nothing for the optimiser to resize or cache, and routing it through
                            `/_next/image` would only add a hop. It also keeps the API host out of
                            `remotePatterns`, which is the list of hosts the optimiser may fetch —
                            not the list a page may link to. */}
                        <Image
                            src={qrSrc}
                            alt={t('rail_qr_alt')}
                            data-testid={subTestId(testId, 'qr')}
                            width={132}
                            height={132}
                            unoptimized
                            className="block"
                        />
                    </div>
                </div>

                <p className="type-dense-default text-center text-(--text-subtitle)">
                    {t('rail_qr_stores')}
                </p>

                <StoreButtons testId={subTestId(testId, 'stores')} />

                {/* Escape and the backdrop already dismiss this, but neither is visible. Literally
                    the same control `AccountSwitcherDialog` and `LoginDialog` use — `DialogCloseButton`,
                    which is also where legacy's `dialogs/shareQr` puts its own — last in the DOM so
                    initial focus lands on the content rather than on the way out. */}
                <DialogCloseButton
                    data-testid={subTestId(testId, 'close')}
                    className="absolute end-2 top-2"
                />
            </DialogContent>
        </Dialog>
    )
}

/**
 * The two store buttons, and the only thing here that reads remote config.
 *
 * Exported because a second dialog needs exactly this pair: `ChannelLiveRestrictedDialog`, where a
 * desktop reader is told the stream only plays in the app. Two copies of a store badge is how one of
 * them ends up pointing at a listing that moved.
 *
 * A component rather than four lines in `GetAppDialog`, for one reason: **`GetAppDialog` is mounted
 * on every route that shows the end rail, and this is not.** `DialogContent` renders through
 * `BaseDialog.Portal`, which unmounts its children while the dialog is closed, so putting the
 * `useWebConfig()` call in here means the Firebase Remote Config chunk is not loaded and no
 * request is made until somebody actually opens the dialog — instead of on every desktop page
 * load, for the ~all of visitors who never press Get App.
 *
 * That is the promise `shared/lib/remote-config` makes ("a page that reads no config pays
 * nothing") applied to the one consumer that could have quietly broken it. Nothing is lost by
 * deferring: the fallback for these two fields *is* the real store URL, so the first paint of the
 * button is already correct and a later swap only ever replaces a working link with a working link.
 */
export function StoreButtons({ testId }: { testId?: string }) {
    const { t } = useTranslation()
    const { download } = useWebConfig()

    return (
        /*
         * `DialogFooter`, not a hand-rolled row of `fullWidth` buttons. `fullWidth` is `w-full`, so
         * two of them side by side come to 200% plus the gap and the second one runs straight out of
         * the popup — which is exactly what this did. The DS group sizes its children with
         * `[&>*]:flex-1` instead, and `ConfirmDialog` is the reference for the pair:
         * `side-by-side`, `size="large"`.
         *
         * Unconditionally a row, with no viewport breakpoint: the popup is a fixed 370 capped at
         * `100vw - 2rem`, so the space these two share does not track the window, and a `sm:`
         * prefix here was answering a question about the page.
         */
        <DialogFooter layout="side-by-side">
            {/* `justify-start px-3`: the DS button centres a single label, and a badge is
                    a mark plus a two-line block that has to sit against the leading edge.
                    `aria-label` restates the two lines as one sentence, because a screen
                    reader announcing "Download on the" and "App Store" as separate runs is
                    not what the badge says. */}
            <Button
                variant="secondary"
                size="large"
                className="justify-start px-3"
                aria-label={`${t('rail_qr_download_on_the')} ${t('rail_qr_app_store')}`}
                data-testid={subTestId(testId, 'ios')}
                render={<a href={download.ios.link} target="_blank" rel="noreferrer noopener" />}
            >
                <StoreBadge
                    mark="apple"
                    lead={t('rail_qr_download_on_the')}
                    name={t('rail_qr_app_store')}
                />
            </Button>
            <Button
                variant="secondary"
                size="large"
                className="justify-start px-3"
                aria-label={`${t('rail_qr_get_it_on')} ${t('rail_qr_google_play')}`}
                data-testid={subTestId(testId, 'android')}
                render={
                    <a href={download.android.link} target="_blank" rel="noreferrer noopener" />
                }
            >
                <StoreBadge
                    mark="play"
                    lead={t('rail_qr_get_it_on')}
                    name={t('rail_qr_google_play')}
                />
            </Button>
        </DialogFooter>
    )
}
