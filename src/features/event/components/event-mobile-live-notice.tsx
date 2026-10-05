'use client'

import { StoreButtons } from '@shared/components/get-app-dialog'
import { LiveRing } from '@shared/components/live-ring'
import { Sheen } from '@shared/components/sheen'
import { useTranslation } from '@shared/i18n/use-translation'
import { POP, RISE } from '@shared/lib/motion'
import { cn } from '@shared/lib/utils'
import { Avatar, AvatarInitials } from '@shared/ui/avatar'
import { Button } from '@shared/ui/button'
import { Icon } from '@shared/ui/icon'
import Image from 'next/image'
import Link from 'next/link'
import { appLink } from '../access'
import type { EventDetail } from '../api/types'
import { EVENT_STUDIO_BACKDROP, EVENT_STUDIO_SCRIM, EVENT_STUDIO_STAGE } from '../lib/studio'
import { StudioPortal } from './event-studio-screen'

/**
 * **"Live isn't available on mobile web"** — what a phone gets for a stream that is on air.
 *
 * Legacy shows the details page below 900px, and Figma draws this frame for the case; the phone
 * studio this port built (`EventStudioCompact`) is switched off for now (`COMPACT_STUDIO_ENABLED`).
 * So a narrow screen on a live stream gets one clear screen instead of a details page that buries
 * the fact: the stream is on, here is who is streaming, and the way to watch it is the app.
 *
 * Over the stream's own blurred art, like the studio, so it reads as *this* broadcast — the host's
 * face in Figma's turning live ring with its `Live` pill, the stream's title, the sentence, *Open
 * in Tevi App* (the stream's own link, which the app claims), the two store badges for a reader
 * without the app, and the way back to the space.
 *
 * Motion: the ground fades up, the card rises, the face pops in a beat later and its halo
 * breathes, then the words and the actions arrive in reading order; the CTA carries the sheen.
 */
export function EventMobileLiveNotice({
    event,
    backdropUrl = null,
    contained = false,
}: {
    event: EventDetail
    backdropUrl?: string | null
    /** In a box rather than over the site — `/dev/event`'s phone frame. */
    contained?: boolean
}) {
    const { t } = useTranslation()
    const channel = event.channel
    const name = channel?.name ?? (channel?.slug ? `@${channel.slug}` : '')
    const thumb = channel?.images.thumb ?? null
    const art = event.images.banner ?? thumb
    const url = appLink(event)

    const screen = (
        <main
            data-testid="event-mobile-live"
            className={
                contained ? 'relative size-full overflow-hidden bg-black' : EVENT_STUDIO_STAGE
            }
        >
            {art && (
                <div aria-hidden className={EVENT_STUDIO_BACKDROP}>
                    <Image
                        src={backdropUrl ?? art}
                        alt=""
                        fill
                        sizes="100vw"
                        className="object-cover"
                    />
                </div>
            )}
            <div aria-hidden className={EVENT_STUDIO_SCRIM} />

            <div className="relative z-10 flex h-full flex-col overflow-y-auto overscroll-contain px-4 pt-[calc(env(safe-area-inset-top)+12px)] pb-[calc(env(safe-area-inset-bottom)+20px)]">
                {channel?.slug && (
                    <Link
                        href={`/@${encodeURIComponent(channel.slug)}`}
                        aria-label={t('channel_live_back_to_space', { name })}
                        data-testid="event-mobile-live-back"
                        className="grid size-10 flex-none place-items-center rounded-full bg-black/35 text-white ring-1 ring-inset ring-white/15 backdrop-blur-md transition-transform active:scale-95 motion-reduce:transition-none"
                    >
                        <Icon name="angle-left" size={20} className="rtl:-scale-x-100" />
                    </Link>
                )}

                <div className="flex flex-1 items-center justify-center py-6">
                    <section
                        className={cn(
                            'dark flex w-full max-w-[400px] flex-col items-center gap-5 rounded-3xl p-6 text-center',
                            'bg-[rgba(20,16,30,0.72)] ring-1 ring-inset ring-white/10 backdrop-blur-2xl',
                            'shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_24px_60px_rgba(0,0,0,0.45)]',
                            RISE,
                            '[animation-delay:80ms]',
                        )}
                    >
                        {/*
                         * The host, live — the shared `LiveRing` (Figma `.❖ Main / Avatar`, Live),
                         * on the card's own ink so the gap reads as cut out of the glass.
                         */}
                        <div className={cn('flex px-2 pt-2 pb-4', POP, '[animation-delay:200ms]')}>
                            <LiveRing
                                label={t('channel_event_live')}
                                className="[--live-ground:#16121F]"
                            >
                                <Avatar
                                    size="2xl"
                                    type={thumb ? 'image' : 'initials'}
                                    className="size-[76px]"
                                >
                                    {thumb ? (
                                        <Image
                                            src={thumb}
                                            alt=""
                                            width={76}
                                            height={76}
                                            className="size-full rounded-full object-cover"
                                        />
                                    ) : (
                                        <AvatarInitials>
                                            {name.replace('@', '').slice(0, 2).toUpperCase()}
                                        </AvatarInitials>
                                    )}
                                </Avatar>
                            </LiveRing>
                        </div>

                        <div
                            className={cn(
                                'flex min-w-0 flex-col gap-1.5',
                                RISE,
                                '[animation-delay:260ms]',
                            )}
                        >
                            {event.title && (
                                <p className="type-caption-label-strong line-clamp-1 text-white/60">
                                    {event.title}
                                </p>
                            )}
                            <h1 className="type-title-t2-semibold text-balance text-white">
                                {t('event_mobile_title')}
                            </h1>
                            <p className="type-dense-default text-pretty text-white/70">
                                {t('event_mobile_body', { name })}
                            </p>
                        </div>

                        <div
                            className={cn(
                                'flex w-full flex-col gap-3',
                                RISE,
                                '[animation-delay:340ms]',
                            )}
                        >
                            {url && (
                                <Button
                                    data-testid="event-mobile-live-app"
                                    variant="accent"
                                    size="large"
                                    fullWidth
                                    render={<a href={url} />}
                                    className="relative overflow-hidden"
                                >
                                    <Sheen />
                                    <Icon
                                        name="signal-stream"
                                        weight="filled"
                                        size={20}
                                        className="relative"
                                    />
                                    <span className="relative">{t('channel_live_open_app')}</span>
                                </Button>
                            )}
                            <StoreButtons testId="event-mobile-live-stores" />
                        </div>
                    </section>
                </div>
            </div>
        </main>
    )
    return contained ? screen : <StudioPortal>{screen}</StudioPortal>
}
