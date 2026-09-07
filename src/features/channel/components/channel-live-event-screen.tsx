'use client'

import { StoreButtons } from '@shared/components/get-app-dialog'
import { useMobilePlatform } from '@shared/hooks/use-mobile-platform'
import { useTranslation } from '@shared/i18n/use-translation'
import { qrImageUrl } from '@shared/lib/qr-image'
import { useWebConfig } from '@shared/lib/remote-config'
import { Button } from '@shared/ui/button'
import Image from 'next/image'
import type { ChannelEvent } from '../api/events-api'
import type { Channel } from '../api/types'
import { appLink, isPlatformRestricted } from '../lib/live-access'

/**
 * The page behind a share link, a QR code or the Posts tab's live card.
 *
 * ## One screen, two sentences
 *
 * Legacy's event page has a player and falls back to `PlatformRestricted` when the website may not
 * show the stream. This rewrite has no player, so the fallback *is* the page — but the two cases
 * still say different things, and flattening them would be a small lie in both directions:
 *
 * - **Restricted**: the website is not allowed to play this one. That is a refusal, and the copy is
 *   legacy's own so the two clients cannot drift.
 * - **Not restricted**: nothing is refusing anything; this client simply cannot play a live yet.
 *   Saying "restricted" there would blame the creator's settings for our missing feature.
 *
 * Both end in the same place — the app — which is why they share everything below the sentence.
 */
export function ChannelLiveEventScreen({
    channel,
    event,
}: {
    channel: Channel
    event: ChannelEvent
}) {
    const { t } = useTranslation()
    const platform = useMobilePlatform()
    const { download } = useWebConfig()
    const restricted = isPlatformRestricted(event)
    const url = appLink(event)
    const storeLink = platform === 'ios' ? download.ios.link : download.android.link

    return (
        <main className="mx-auto flex w-full max-w-[520px] flex-1 flex-col items-center gap-6 px-4 py-10 text-center">
            <div className="flex min-w-0 flex-col gap-2">
                <h1 className="type-title-t2-semibold text-(--text-title)">
                    {restricted ? `🚫 ${t('channel_live_restricted_title')}` : event.title}
                </h1>
                <p className="type-dense-default text-(--text-subtitle)">
                    {restricted
                        ? t('channel_live_restricted_body')
                        : t('channel_live_watch_in_app_body')}
                </p>
                <p className="type-caption-meta text-(--text-placeholder)">
                    @{channel.slug}
                    {restricted && event.title ? ` · ${event.title}` : ''}
                </p>
            </div>

            {/*
             * The QR encodes the **stream**, so a phone that already has the app lands on this
             * livestream rather than on a store listing — the one thing the button cannot do. It is
             * desktop-only for the reason it always is: the device holding it cannot scan it.
             */}
            {url && platform === null && (
                <div className="flex flex-col items-center gap-3">
                    <div className="rounded-(--radius-lg) bg-white p-3">
                        <Image src={qrImageUrl(url)} alt="" width={180} height={180} unoptimized />
                    </div>
                    <p className="type-caption-meta text-(--text-subtitle)">
                        {t('channel_live_restricted_scan')}
                    </p>
                </div>
            )}

            <div className="w-full">
                {platform ? (
                    <Button
                        data-testid="channel-event-get-app"
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
            </div>

            {/* Back to the space rather than to the home feed: they came from a link *about* this
                creator, so the creator is the nearest useful place. Legacy sends them to `/`. */}
            <Button
                data-testid="channel-event-visit"
                variant="ghost"
                size="medium"
                render={<a href={`/@${channel.slug}`} />}
            >
                {t('channel_live_back_to_space', { name: channel.name ?? channel.slug })}
            </Button>
        </main>
    )
}
