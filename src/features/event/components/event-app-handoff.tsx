'use client'

import { StoreButtons } from '@shared/components/get-app-dialog'
import { useMobilePlatform } from '@shared/hooks/use-mobile-platform'
import { useTranslation } from '@shared/i18n/use-translation'
import { qrImageUrl } from '@shared/lib/qr-image'
import { useWebConfig } from '@shared/lib/remote-config'
import { Button } from '@shared/ui/button'
import Image from 'next/image'

/**
 * **Where the stream can actually be watched** — the app, reached the way the reader's device allows.
 *
 * The one honest answer this client has for "play it": there is no web player in this rewrite (see
 * `docs/EVENT.md` §3), and four of the six watch states end here. Factored out precisely because
 * they do — the QR, the plate it sits on and the store pair are identical in all four, and the only
 * thing that differs is the sentence above them.
 *
 * ## The QR encodes the **stream**, not the store
 *
 * Scanning it on a phone that already has the app lands on this livestream. An App Store link cannot
 * do that — it opens the store even when the app is installed — and that is the trade, made the
 * right way round for who is reading: somebody looking at the website is, by definition, not in the
 * app. `url` is the event's app-associated URL (`appLink`, so `/e/{code}/` first), and the panel
 * that renders this passes `null` when the payload carried neither, which is the one case the code
 * cannot be drawn.
 *
 * ## Desktop gets the QR, a phone gets the button
 *
 * A QR printed on the device you are holding is the one screen that cannot scan it. `platform` is
 * `null` until the client has looked — so the **store pair is what the server renders**, which is
 * also what a desktop keeps, and a phone swaps to a single button on mount. See
 * `useMobilePlatform`.
 *
 * The store links come from remote config, so a relist or a regional storefront does not need a
 * deploy; `useWebConfig`'s fields are never null (its own doc explains the per-field fallbacks), so
 * there is no `??` here.
 */
export function EventAppHandoff({
    url,
    testId,
}: {
    /** The stream's app-associated URL — what the QR encodes. `null` drops the QR, not the buttons. */
    url: string | null
    testId?: string
}) {
    const { t } = useTranslation()
    const platform = useMobilePlatform()
    const { download } = useWebConfig()
    const storeLink = platform === 'ios' ? download.ios.link : download.android.link

    return (
        <div className="flex w-full min-w-0 flex-col items-center gap-4">
            {url && platform === null && (
                <div className="flex flex-col items-center gap-2">
                    {/*
                     * A white plate in **both** themes, and not a token: a QR is read by a camera
                     * looking for dark modules on a light quiet zone, and inverting it for dark mode
                     * makes it unscannable on many readers. Every QR in this app is drawn this way.
                     */}
                    <div className="rounded-(--radius-lg) bg-white p-3">
                        {/*
                         * `unoptimized`, as everywhere this endpoint is used: the API renders one
                         * PNG per URL, so there is nothing to resize, and skipping the optimiser
                         * keeps the API host out of `remotePatterns`.
                         */}
                        <Image src={qrImageUrl(url)} alt="" width={160} height={160} unoptimized />
                    </div>
                    <p className="type-caption-meta max-w-[280px] text-center text-(--text-subtitle)">
                        {t('event_scan_to_watch')}
                    </p>
                </div>
            )}

            {platform ? (
                /*
                 * A real anchor through `render`, not an `onClick` that assigns `location`: it is a
                 * navigation, so it should be middle-clickable and show its destination in the
                 * status bar — and `Button` gives an anchor `role="link"` for the same reason.
                 *
                 * The **stream's** URL when there is one, falling back to the store: on a phone with
                 * the app installed the app-associated link opens the app on this broadcast, which
                 * is strictly better than a store listing. `target="_blank"` only for the store,
                 * because a deep link that hands off to the app should not leave an empty tab behind.
                 */
                url ? (
                    <Button
                        data-testid={testId}
                        variant="accent"
                        size="large"
                        fullWidth
                        // internal-link-ok: an app-associated universal link. It has this site's
                        // own origin, so it reads as internal to `check-internal-links.mjs` — but
                        // the whole point is that the OS intercepts it and opens the native app.
                        // Routing it through `next/link` would keep it inside the browser, which is
                        // the one outcome this button exists to avoid.
                        render={<a href={url} />}
                    >
                        {t('channel_live_open_app')}
                    </Button>
                ) : (
                    <Button
                        data-testid={testId}
                        variant="accent"
                        size="large"
                        fullWidth
                        render={<a href={storeLink} target="_blank" rel="noreferrer noopener" />}
                    >
                        {t('channel_live_open_app')}
                    </Button>
                )
            ) : (
                <StoreButtons testId={testId} />
            )}
        </div>
    )
}
