'use client'

import { ChannelLiveBadge, type FollowedLive } from '@features/channel'
import { StarMark } from '@shared/components/star-mark'
import { VerifiedBadge } from '@shared/components/verified-badge'
import { useTranslation } from '@shared/i18n/use-translation'
import { POP, RISE } from '@shared/lib/motion'
import { cn } from '@shared/lib/utils'
import { Avatar, AvatarInitials } from '@shared/ui/avatar'
import { Icon } from '@shared/ui/icon'
import Image from 'next/image'
import Link from 'next/link'
import { liveAccess } from '../access'
import { eventPath } from '../routes'

/**
 * **"The live broadcast has ended. Discover more creators"** — the studio's ended screen when the
 * reader follows channels that are live right now.
 *
 * Legacy's `liveView/ended/content`, which **replaces** the ended card rather than sitting under
 * it: a 900px block centred on the stage, a rule with the headline in it, the lives, and *Back to
 * home*. With no lives to offer — or for a guest, who has no follows — legacy falls back to the
 * plain ended card, and so does the caller here.
 *
 * ## A row, not a carousel
 *
 * Legacy uses Swiper at 3.5 slides with prev/next arrows. By `docs/DESIGN_SYSTEM.md` §10 that is a
 * **scrolling row** — several small items visible, "there is more this way" — not a carousel with
 * slide semantics, so it is native `overflow-x-auto` + `snap-x`: the browser keeps momentum,
 * scroll-into-view on focus and `overscroll-behavior`, all of which a transform track loses. Fewer
 * than three lives are laid out centred instead, as legacy's `Grid` branch does, since a row of two
 * scrolling nowhere reads as a broken carousel.
 *
 * Literal inks: this sits on the stage's scrim (`lib/studio.ts`), like the rest of the studio.
 */
export function EventEndedRail({ lives, locale }: { lives: FollowedLive[]; locale: string }) {
    const { t } = useTranslation()
    const few = lives.length < 3

    return (
        <section
            data-testid="event-ended-rail"
            aria-labelledby="event-ended-rail-title"
            /*
             * No panel of its own: the stage behind is blurred out in full (the caller's scrim),
             * so the content stands straight on it — a card here was a second surface floating on
             * the first. It `RISE`s in after the blur fades up; the pieces follow on a stagger.
             */
            className={cn(
                'mx-auto flex w-full max-w-[900px] flex-col gap-6',
                RISE,
                '[animation-delay:120ms]',
            )}
        >
            {/*
             * Legacy's `<Divider>` with the sentence in it — two rules and the words between, the
             * rules now fading out toward the edges so the line opens from the words, and an
             * ended-broadcast mark over it so the block says *what happened* before it reads.
             */}
            <div className="flex flex-col items-center gap-3">
                <span
                    aria-hidden
                    className={cn(
                        'grid size-11 place-items-center rounded-full bg-white/10 text-white/85 ring-1 ring-inset ring-white/15',
                        POP,
                        '[animation-delay:240ms]',
                    )}
                >
                    <Icon name="signal-stream" weight="filled" size={20} />
                </span>
                <div className="flex w-full items-center gap-3">
                    <span
                        aria-hidden
                        className="h-px flex-1 bg-[linear-gradient(90deg,transparent,rgba(224,224,224,0.5))] rtl:bg-[linear-gradient(270deg,transparent,rgba(224,224,224,0.5))]"
                    />
                    <h2
                        id="event-ended-rail-title"
                        className="type-body-emphasis text-balance text-center text-white"
                    >
                        {t('event_studio_ended_discover')}
                    </h2>
                    <span
                        aria-hidden
                        className="h-px flex-1 bg-[linear-gradient(270deg,transparent,rgba(224,224,224,0.5))] rtl:bg-[linear-gradient(90deg,transparent,rgba(224,224,224,0.5))]"
                    />
                </div>
            </div>

            <ul
                className={cn(
                    'flex',
                    few
                        ? 'justify-center gap-4'
                        : [
                              'snap-x snap-mandatory gap-5 overflow-x-auto overscroll-x-contain pb-1',
                              '[scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
                              // The trailing half-card dissolves into the panel edge — "more this
                              // way" without an arrow. Leading edge stays sharp: the row starts there.
                              '[mask-image:linear-gradient(90deg,black_calc(100%-48px),transparent)]',
                              'rtl:[mask-image:linear-gradient(270deg,black_calc(100%-48px),transparent)]',
                          ],
                )}
            >
                {lives.map((live, index) => (
                    <li
                        key={live.code ?? `live-${index}`}
                        className={cn(
                            'flex-none snap-start',
                            RISE,
                            // Legacy's widths: a third of the row in the `Grid` branch, and 3.5
                            // across with 20px between them in the Swiper one.
                            few ? 'w-[calc((100%-2rem)/3)]' : 'w-[calc((100%-3.75rem)/3.5)]',
                        )}
                        // After the panel and its header: cards follow 60ms apart.
                        style={{ animationDelay: `${300 + Math.min(index, 6) * 60}ms` }}
                    >
                        <EndedLiveCard live={live} locale={locale} />
                    </li>
                ))}
            </ul>

            <Link
                data-testid="event-ended-rail-home"
                href="/"
                className={cn(
                    'type-body-emphasis mx-auto flex h-12 w-full max-w-[486px] items-center justify-center gap-2 rounded-full text-white',
                    'bg-white/12 ring-1 ring-inset ring-white/15 transition-colors hover:bg-white/20',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70',
                    RISE,
                )}
                style={{ animationDelay: `${360 + Math.min(lives.length, 6) * 60}ms` }}
            >
                <Icon name="house" size={20} />
                {t('event_studio_back_home')}
            </Link>
        </section>
    )
}

/**
 * One live — legacy's `liveItem`: a 16:9 banner with the LIVE flag leading-top and the access badge
 * trailing-bottom, the title, and the channel. Two destinations, as legacy's has: the banner and
 * title go to the stream, the channel row to the space — which is why this is not one big link.
 */
function EndedLiveCard({ live, locale }: { live: FollowedLive; locale: string }) {
    const { t } = useTranslation()
    const channel = live.channel
    if (!channel || !live.code) return null

    const href = eventPath(channel.slug, live.code)
    const access = liveAccess(live)
    const price = access?.price == null ? null : new Intl.NumberFormat(locale).format(access.price)
    const banner = live.images?.banner ?? null
    const avatar = channel.images?.thumb ?? null
    const name = channel.name ?? channel.slug

    return (
        <div className="flex flex-col gap-2">
            <Link
                href={href}
                data-testid="event-ended-rail-live"
                // A channel is live once at a time, so its slug names the card — the companion
                // `FollowingLiveRow` uses for the same stream.
                data-channel-slug={channel.slug}
                className="group flex flex-col gap-2 rounded-xl no-underline outline-none focus-visible:ring-2 focus-visible:ring-white/70"
            >
                {/*
                 * The banner lifts on hover — up 2px, a deeper shadow, the picture easing in — and
                 * a hairline keeps its edge on a dark banner. The bottom shade is what the access
                 * badge reads against on a bright one.
                 */}
                <span className="relative block aspect-video overflow-hidden rounded-xl bg-black/50 shadow-[0_6px_16px_rgba(0,0,0,0.35)] ring-1 ring-white/10 transition-[translate,box-shadow] duration-300 ease-out group-hover:-translate-y-0.5 group-hover:shadow-[0_12px_28px_rgba(0,0,0,0.5)] motion-reduce:transition-none">
                    {banner && (
                        <Image
                            src={banner}
                            alt=""
                            fill
                            sizes="260px"
                            className="object-cover transition-[scale] duration-500 ease-out group-hover:scale-105 motion-reduce:transition-none"
                        />
                    )}
                    <span
                        aria-hidden
                        className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 bg-[linear-gradient(to_top,rgba(0,0,0,0.45),transparent)]"
                    />
                    <ChannelLiveBadge className="absolute start-2 top-2 w-14" />
                    {access && (
                        <span className="type-caption-label absolute end-2 bottom-2 flex max-w-[calc(100%-1rem)] items-center gap-1 rounded-(--radius-fill) border border-white/50 bg-black/50 px-1.5 py-0.5 text-white">
                            <span className="truncate">
                                {t(access.key, { price: price ?? '' })}
                            </span>
                            {access.price !== null && <StarMark size={14} />}
                        </span>
                    )}
                </span>
                <span className="type-caption-label-strong truncate text-[#F9F9F9] transition-colors group-hover:text-white">
                    {live.title}
                </span>
            </Link>
            <Link
                href={`/@${encodeURIComponent(channel.slug)}`}
                className="flex min-w-0 items-center gap-2 no-underline"
            >
                <Avatar size="xs" type={avatar ? 'image' : 'initials'} className="flex-none">
                    {avatar ? (
                        <Image
                            src={avatar}
                            alt=""
                            width={24}
                            height={24}
                            className="size-full rounded-full object-cover"
                        />
                    ) : (
                        <AvatarInitials>{name.slice(0, 2).toUpperCase()}</AvatarInitials>
                    )}
                </Avatar>
                <span className="type-caption-label truncate text-[#E0E0E0]">{name}</span>
                {channel.verified_tick_badge?.image && (
                    <VerifiedBadge image={channel.verified_tick_badge.image} size="caption" />
                )}
            </Link>
        </div>
    )
}
