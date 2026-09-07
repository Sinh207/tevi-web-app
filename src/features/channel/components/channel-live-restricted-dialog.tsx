'use client'

import { StoreButtons } from '@shared/components/get-app-dialog'
import { useMobilePlatform } from '@shared/hooks/use-mobile-platform'
import { useTranslation } from '@shared/i18n/use-translation'
import { qrImageUrl } from '@shared/lib/qr-image'
import { useWebConfig } from '@shared/lib/remote-config'
import { Button } from '@shared/ui/button'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@shared/ui/dialog'
import Image from 'next/image'

/**
 * What a reader gets when they open a stream the website is not allowed to play.
 *
 * ## Said before the tap, not after it
 *
 * `restricted_platforms: ["Website"]` is the backend telling this platform it may not show the
 * stream. Legacy honours it on the **event page** — a full `PlatformRestricted` panel where the
 * video would be — but advertises the stream everywhere else, so the reader travels to a page that
 * refuses them. This says the same thing at the point of the press, and the copy is legacy's own so
 * the two surfaces cannot drift.
 *
 * ## Two ways out, because two kinds of reader see this
 *
 * - **On a phone**, one button straight to that platform's store listing — App Store on iOS, Play
 *   on Android, read from remote config so a relist or a regional storefront does not need a
 *   deploy. `useMobilePlatform` decides which.
 * - **On a desktop**, the QR plus both store badges: the phone is the only device that can play the
 *   stream, and the QR is the only thing here that reaches it. Same branded code
 *   (`qrImageUrl`) and the same `StoreButtons` as `GetAppDialog`, not a second copy of either.
 *
 * The QR encodes the **stream**, not the store — scanning it on a phone that already has the app
 * lands on this livestream rather than on a listing. The button cannot do that: an App Store link
 * opens the store even when the app is installed. That is the trade, and it is the right way round
 * for who is reading — somebody looking at the website is, by definition, not in the app.
 */
export function ChannelLiveRestrictedDialog({
    open,
    onOpenChange,
    url,
}: {
    open: boolean
    onOpenChange: (open: boolean) => void
    /** The stream's app-associated URL — what the QR encodes. Not opened without one. */
    url: string
}) {
    const { t } = useTranslation()
    const platform = useMobilePlatform()
    const { download } = useWebConfig()
    const storeLink = platform === 'ios' ? download.ios.link : download.android.link

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-[390px]">
                <DialogHeader>
                    {/* Legacy leads with the 🚫 and it earns its place: this is a refusal, and the
                        glyph says so before the sentence is read. */}
                    <DialogTitle>🚫 {t('channel_live_restricted_title')}</DialogTitle>
                    <DialogDescription>{t('channel_live_restricted_body')}</DialogDescription>
                </DialogHeader>

                {/*
                 * Desktop only. A QR printed on the phone you are already holding is the one
                 * device that cannot scan it — there, the button is the whole answer.
                 */}
                {platform === null && (
                    <div className="flex flex-col items-center gap-3">
                        {/*
                         * White plate in both themes: a QR is read by a camera looking for dark modules
                         * on a light quiet zone, and inverting it for dark mode makes it unscannable on
                         * many readers.
                         */}
                        <div className="rounded-(--radius-lg) bg-white p-3">
                            {/* `unoptimized`, as everywhere this endpoint is used: the API renders one
                            PNG per URL, so there is nothing to resize, and skipping the optimiser
                            keeps the API host out of `remotePatterns`. */}
                            <Image
                                src={qrImageUrl(url)}
                                alt=""
                                width={160}
                                height={160}
                                unoptimized
                            />
                        </div>
                        <p className="type-caption-meta text-center text-(--text-subtitle)">
                            {t('channel_live_restricted_scan')}
                        </p>
                    </div>
                )}

                {/*
                 * A real anchor through `render`, not an `onClick` that assigns `location`: it is a
                 * navigation, so it should be middle-clickable and show its destination in the
                 * status bar — and `Button` gives an anchor `role="link"` for the same reason.
                 * `accent` because it is the one action here, and this app's CTA is accent.
                 *
                 * `platform` is `null` until the client has looked, so the store pair is what the
                 * server renders and what a desktop keeps. See `useMobilePlatform`.
                 */}
                {platform ? (
                    <Button
                        data-testid="channel-live-get-app"
                        variant="accent"
                        size="large"
                        fullWidth
                        render={<a href={storeLink} target="_blank" rel="noreferrer noopener" />}
                    >
                        {t('channel_live_open_app')}
                    </Button>
                ) : (
                    <StoreButtons />
                )}
            </DialogContent>
        </Dialog>
    )
}
