'use client'

import { appLink, isExclusiveLive, isPlatformRestricted } from '@features/event/access'
import { formatPostTimestamp } from '@features/post'
import { AnimatedAvatar } from '@shared/components/animated-avatar'
import { LiveDot } from '@shared/components/live-dot'
import { LiveRing } from '@shared/components/live-ring'
import { VerifiedBadge } from '@shared/components/verified-badge'
import { useTranslation } from '@shared/i18n/use-translation'
import { cn } from '@shared/lib/utils'
import { Badge } from '@shared/ui/badge'
import { Icon } from '@shared/ui/icon'
import Link from 'next/link'
import { type CSSProperties, useState } from 'react'
import type { FollowedLive } from '../api/types'
import { toChannelPath } from '../lib/channel-slug'
import { ChannelEventMenu } from './channel-event-menu'
import { LiveMedia } from './channel-live-now'
import { ChannelLiveRestrictedDialog } from './channel-live-restricted-dialog'

/**
 * One stream on the home page's **Lives** tab — Figma's `Live Event Container` from
 * `Live Display Improvements` (the `Post` frame, `5126:225550`).
 *
 * ## Why this is not `FollowingLiveRow`
 *
 * That row is `/following`'s strip: a compact horizontal tile beside a two-line caption, sized to sit
 * *above* the list the screen is about. On the home tab the list **is** the screen, and Figma draws
 * it as the full card — the same anatomy as `ChannelLiveNow`'s item on a space page, plus two rows
 * that page does not have:
 *
 * 1. the channel header — avatar (in its live ring), name, verified mark, `@slug`, when it went on
 *    air, and the share / QR menu;
 * 2. the 16/9 banner with the Live flag and the gating chip — **`LiveMedia`**, imported from the
 *    space page's card rather than redrawn, so the access label has one copy;
 * 3. *Happening now* with the red dot, and the Exclusive / Free chip trailing it;
 * 4. the title, then the date block — a framed calendar mark beside the date and the time.
 *
 * ## The time line is the start, not a range
 *
 * Figma prints `18:30 - 21:00 GMT+7`. The payload has no scheduled end: `followed-channels/lives/`
 * carries `start_at` and `started_at`, and the only end field anywhere in legacy is `ended_at`, which
 * a stream that is on air does not have yet. So the line is the start with its zone, and inventing a
 * second number to fill the design is the one thing it must not do.
 *
 * ## Two destinations, so not one anchor
 *
 * As on the space page: the header goes to the space, the banner and the title go to the stream, and
 * the overflow menu is a `<button>` that cannot sit inside an anchor. A stream the website may not
 * play opens `ChannelLiveRestrictedDialog` from the same two places instead.
 *
 * ## Surface
 *
 * A full-bleed band below `md` and a 16px-radius card from `md`, separated by the page colour — the
 * same split `HomePostFeed` makes for posts, so both tabs read as one feed.
 */
export function FollowedLiveCard({
    live,
    testId,
    style,
    className,
}: {
    live: FollowedLive
    testId?: string
    /** For the caller's entrance stagger. */
    style?: CSSProperties
    className?: string
}) {
    const { t, currentLanguage } = useTranslation()
    const { channelHref, href, restrictedTo, onRestricted, restrictedOpen, setRestrictedOpen } =
        useLiveDestinations(live)

    const channel = live.channel
    if (!channel) return null

    const slug = channel.slug

    const name = channel.name || `@${slug}`
    const exclusive = isExclusiveLive(live)
    const shownAt = live.started_at ?? live.start_at
    /*
     * Absolute, `Feb 18, 2025 - 18:02` — Figma's header and legacy's `formatDateTime(started_at)`, and
     * the same formatter the post cards above and below it use, so a feed mixing both tabs' rows never
     * shows two clocks. Not relative: "25 minutes ago" on a card that is never re-rendered goes stale.
     */
    const since = shownAt ? formatPostTimestamp(shownAt, currentLanguage) : ''
    const when = formatLiveWhen(shownAt, currentLanguage)

    const title = live.title ? (
        <p className="type-body-strong line-clamp-2 min-w-0 text-(--text-title)">{live.title}</p>
    ) : null

    return (
        <li
            data-testid={testId}
            data-channel-slug={slug}
            style={style}
            className={cn(
                // `overflow-clip`: `LiveRing`'s blurred halo is wider than the avatar and would
                // otherwise haze the page colour past the card's corner.
                'flex min-w-0 flex-col overflow-clip bg-(--background-surface) px-1 py-2 md:rounded-2xl md:px-6 md:py-3',
                className,
            )}
        >
            {/* 1 — the channel header. 56 tall, 12 inset, as Figma's `User` row. */}
            {/* The hairline under it is Figma's `User` frame stroke. */}
            <div className="flex min-w-0 items-center gap-2 border-(--separator-default) border-b px-3 py-2">
                {/* `aria-hidden` + out of the tab order: the name beside it is the same link. */}
                <Link href={channelHref} className="flex-none" tabIndex={-1} aria-hidden="true">
                    {/* Figma's `Avatar / Live=Yes`: the ring and the *Live* tag under it. */}
                    <LiveRing
                        label={t('channel_event_live')}
                        size="compact"
                        className="[--live-gap:2px] [--live-ring:2px]"
                    >
                        <AnimatedAvatar
                            size="small"
                            thumb={channel.images.thumb}
                            avatarVideo={channel.images.avatar_video}
                            isPremium={false}
                            alt=""
                            initials={name.replace('@', '').slice(0, 2).toUpperCase()}
                        />
                    </LiveRing>
                </Link>
                <div className="flex min-w-0 flex-1 flex-col ps-1">
                    <div className="flex min-w-0 items-center gap-1">
                        <Link
                            data-testid="channel-followed-live-channel-link"
                            href={channelHref}
                            className="type-dense-strong min-w-0 truncate text-(--text-title) hover:underline"
                        >
                            {name}
                        </Link>
                        <VerifiedBadge image={channel.verified_tick_badge?.image} size="dense" />
                        <span className="type-caption-meta min-w-0 truncate text-(--text-body)">
                            @{slug}
                        </span>
                    </div>
                    {since && (
                        <time
                            dateTime={shownAt ?? undefined}
                            className="type-caption-meta min-w-0 truncate text-(--text-placeholder)"
                        >
                            {since}
                        </time>
                    )}
                </div>
                {/* Figma's `More / Type=Horizontal`, the same glyph as a post card's menu. */}
                <ChannelEventMenu event={live} slug={slug} orientation="horizontal" />
            </div>

            {/* 2 — the banner. Inset 12, as Figma's `Image resolution app`. */}
            <div className="px-3">
                <LiveMedia event={live} href={href} onRestricted={onRestricted} />
            </div>

            {/* 3 — Happening now · Exclusive / Free. */}
            <div className="flex min-w-0 items-center justify-between gap-2 border-(--separator-default) border-b px-3 py-2">
                {/*
                 * Figma's `#e41f37`, which is darker than `--text-error` on purpose: this is a
                 * 14px sentence, and `--text-error`'s `#ff3636` misses AA on white at that size.
                 * `--accents-error-focus` is the token that passes in both modes.
                 */}
                <span className="type-dense-strong flex min-w-0 items-center gap-1 text-(--accents-error-focus) uppercase">
                    <LiveDot />
                    <span className="truncate">{t('following_live_happening_now')}</span>
                </span>
                {/* `medium` — 24 tall, 8 inset, a 16px glyph: Figma's chip is 26 / 8 / 16. */}
                <Badge size="medium" status="default" weight="strong" className="flex-none">
                    <Icon
                        name={exclusive ? 'badge-dollar' : 'users'}
                        weight="filled"
                        size={16}
                        aria-hidden="true"
                    />
                    {t(exclusive ? 'following_live_exclusive' : 'following_live_free')}
                </Badge>
            </div>

            {/* 4 — title and when. */}
            {(title || when) && (
                <div className="flex min-w-0 flex-col gap-3 px-3 py-2">
                    {title &&
                        (href ? (
                            <Link
                                data-testid="channel-followed-live-title-link"
                                href={href}
                                className="min-w-0 hover:underline"
                            >
                                {title}
                            </Link>
                        ) : onRestricted ? (
                            <button
                                data-testid="channel-followed-live-restricted"
                                type="button"
                                className="min-w-0 text-start"
                                onClick={onRestricted}
                            >
                                {title}
                            </button>
                        ) : (
                            title
                        ))}
                    {when && (
                        <div className="flex min-w-0 items-center gap-2">
                            <span className="flex size-9 flex-none items-center justify-center rounded-(--radius-md) border border-(--separator-default) text-(--icon-secondary)">
                                <Icon name="calendar" size={20} aria-hidden="true" />
                            </span>
                            <time
                                dateTime={shownAt ?? undefined}
                                className="flex min-w-0 flex-col gap-1"
                            >
                                <span className="type-dense-strong truncate text-(--text-title)">
                                    {when.date}
                                </span>
                                <span className="type-dense-emphasis truncate text-(--text-body)">
                                    {when.time}
                                </span>
                            </time>
                        </div>
                    )}
                </div>
            )}

            {restrictedTo && (
                <ChannelLiveRestrictedDialog
                    open={restrictedOpen}
                    onOpenChange={setRestrictedOpen}
                    url={restrictedTo}
                />
            )}
        </li>
    )
}

/**
 * Where a followed stream's presses go — shared by the card and the tile, so the two cannot disagree
 * about which streams the website may play.
 *
 * The space for the header, the stream for the banner and the title, and for a stream the website
 * may not play (`isPlatformRestricted`) no link at all: `onRestricted` opens the dialog that offers
 * the app instead, at the press rather than one page later.
 */
function useLiveDestinations(live: FollowedLive) {
    const [restrictedOpen, setRestrictedOpen] = useState(false)
    const channelHref = toChannelPath(live.channel?.slug ?? '')
    const restrictedTo = isPlatformRestricted(live) ? appLink(live) : null
    const href =
        restrictedTo === null && live.code
            ? `${channelHref}/event/${encodeURIComponent(live.code)}`
            : null
    const onRestricted = restrictedTo ? () => setRestrictedOpen(true) : null
    return { channelHref, href, restrictedTo, onRestricted, restrictedOpen, setRestrictedOpen }
}

/**
 * One stream in the **phone** home feed's live strip — the card above, cut down to what a shelf
 * item can carry: whose stream and since when (with the Free / Exclusive badge at the trailing edge),
 * the banner (its Live flag and access chip, `LiveMedia` again), and two lines of title.
 *
 * Below `md` the home page has no tab row: the Lives tab is folded into the Posts feed as a strip at
 * its head, so a phone reader sees what is on air without a press. A full card per stream would push
 * the first post a screen and a half down for every live — the strip keeps it to one row.
 *
 * `78%` of the viewport, capped at 300, so the next tile always shows at the trailing edge — the
 * peek is what says "there is more this way" on a touch screen with no arrows (`DESIGN_SYSTEM.md`
 * §10). `snap-start` so a swipe settles on a whole tile.
 */
export function FollowedLiveTile({
    live,
    fill = false,
    testId,
    style,
    className,
}: {
    live: FollowedLive
    /**
     * Take the whole row — the strip's single-stream case. A lone tile at 78% would leave a fifth of
     * the row empty, with a peek that promises a second stream that is not there.
     */
    fill?: boolean
    testId?: string
    /** For the caller's entrance stagger. */
    style?: CSSProperties
    className?: string
}) {
    const { t, currentLanguage } = useTranslation()
    const { channelHref, href, restrictedTo, onRestricted, restrictedOpen, setRestrictedOpen } =
        useLiveDestinations(live)

    const channel = live.channel
    if (!channel) return null
    const name = channel.name || `@${channel.slug}`
    const exclusive = isExclusiveLive(live)
    const shownAt = live.started_at ?? live.start_at
    // The card's formatter, so the tile and the md+ card print the same clock.
    const since = shownAt ? formatPostTimestamp(shownAt, currentLanguage) : ''

    const title = live.title ? (
        <p className="type-dense-strong line-clamp-2 min-w-0 text-(--text-title)">{live.title}</p>
    ) : null

    return (
        <li
            data-testid={testId}
            data-channel-slug={channel.slug}
            style={style}
            className={cn(
                'flex flex-none snap-start flex-col gap-2',
                fill ? 'w-full' : 'w-[78%] max-w-[300px]',
                className,
            )}
        >
            {/*
             * Whose stream, first — the card's header order: the face in its live ring, the name
             * over when it went on air, and the access badge at the trailing edge.
             */}
            <div className="flex min-w-0 items-center gap-2">
                <Link href={channelHref} className="flex-none" tabIndex={-1} aria-hidden="true">
                    {/* The ring and its *Live* tag, as the md+ card's header draws them. */}
                    <LiveRing
                        label={t('channel_event_live')}
                        size="compact"
                        className="[--live-gap:2px] [--live-ring:2px]"
                    >
                        <AnimatedAvatar
                            size="small"
                            thumb={channel.images.thumb}
                            avatarVideo={channel.images.avatar_video}
                            isPremium={false}
                            alt=""
                            initials={name.replace('@', '').slice(0, 2).toUpperCase()}
                        />
                    </LiveRing>
                </Link>
                <div className="flex min-w-0 flex-1 flex-col ps-0.5">
                    <div className="flex min-w-0 items-center gap-1">
                        <Link
                            data-testid="channel-followed-live-tile-channel-link"
                            href={channelHref}
                            className="type-dense-strong min-w-0 truncate text-(--text-title)"
                        >
                            {name}
                        </Link>
                        <VerifiedBadge image={channel.verified_tick_badge?.image} size="dense" />
                    </div>
                    {since && (
                        <time
                            dateTime={shownAt ?? undefined}
                            className="type-caption-meta min-w-0 truncate text-(--text-placeholder)"
                        >
                            {since}
                        </time>
                    )}
                </div>
                <Badge size="medium" status="default" weight="strong" className="flex-none">
                    <Icon
                        name={exclusive ? 'badge-dollar' : 'users'}
                        weight="filled"
                        size={16}
                        aria-hidden="true"
                    />
                    {t(exclusive ? 'following_live_exclusive' : 'following_live_free')}
                </Badge>
            </div>

            <LiveMedia event={live} href={href} onRestricted={onRestricted} />

            {title &&
                (href ? (
                    <Link
                        data-testid="channel-followed-live-tile-title-link"
                        href={href}
                        className="min-w-0"
                    >
                        {title}
                    </Link>
                ) : onRestricted ? (
                    <button type="button" className="min-w-0 text-start" onClick={onRestricted}>
                        {title}
                    </button>
                ) : (
                    title
                ))}

            {restrictedTo && (
                <ChannelLiveRestrictedDialog
                    open={restrictedOpen}
                    onOpenChange={setRestrictedOpen}
                    url={restrictedTo}
                />
            )}
        </li>
    )
}

/**
 * `Friday, 16 September 2022` over `18:30 GMT+7` — Figma's two lines, localised by `Intl`.
 *
 * The zone is printed because a stream is a moment for everybody watching it, and the reader's clock
 * is not necessarily the creator's. Only ever rendered on the client (the rows need a bearer, which
 * the server never has), so `Intl` differing between Node and the browser cannot become a hydration
 * mismatch here the way it does for the calendar.
 */
function formatLiveWhen(
    value: string | null | undefined,
    locale: string,
): { date: string; time: string } | null {
    if (!value) return null
    const at = new Date(value)
    if (Number.isNaN(at.getTime())) return null
    const format = (options: Intl.DateTimeFormatOptions) => {
        try {
            return new Intl.DateTimeFormat(locale, options).format(at)
        } catch {
            // An unrecognised locale tag must not take the card down.
            return new Intl.DateTimeFormat('en', options).format(at)
        }
    }
    return {
        date: format({ weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
        time: format({ hour: '2-digit', minute: '2-digit', hour12: false, timeZoneName: 'short' }),
    }
}
