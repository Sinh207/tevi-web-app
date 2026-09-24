'use client'

import { appLink, isPlatformRestricted, liveAccess } from '@features/event/access'
import { AnimatedAvatar } from '@shared/components/animated-avatar'
import { StarMark } from '@shared/components/star-mark'
import { useTranslation } from '@shared/i18n/use-translation'
import { Icon } from '@shared/ui/icon'
import Image from 'next/image'
import Link from 'next/link'
import { useState } from 'react'
import type { ChannelEvent } from '../api/events-api'
import type { Channel } from '../api/types'
import { formatActivityDateTime } from '../lib/channel-format'
import { liveEvents } from '../lib/channel-live'
import { ChannelEventMenu } from './channel-event-menu'
import { ChannelLiveBadge } from './channel-live-badge'
import { ChannelLiveRestrictedDialog } from './channel-live-restricted-dialog'
import { ChannelVerifiedMark } from './channel-verified-mark'

/**
 * What a space that is **on air right now** shows at the top of its Posts tab.
 *
 * ## Why it is here and not fetched
 *
 * Legacy's Posts tab has no live item at all — this is new. The constraint that shapes it is that
 * `v4/events/` answers **for the bearer** and takes no slug, so no request can tell a visitor that
 * somebody else is live. The only channel-scoped live signal on the wire is `channel.lives`, which
 * arrives with the page's own payload — so this costs no request and cannot be stale relative to the
 * header's red ring, because both read the same array.
 *
 * ## The card is legacy's home item
 *
 * `containers/home/components/lives/liveItem` is the shape being matched, header included: the
 * channel row (avatar, name, verified tick, `@slug`, the time, the overflow menu), then a 16/9
 * banner with the `icon_live_main` flag over its top-left corner, then the title.
 *
 * The gating badge is drawn from `price` / `required_packages` / `purchased` / `need_unlock_package`
 * — see `liveAccess`, which phrases it the three ways legacy does and fixes the case legacy prices
 * at zero. The header's badge-dollar-versus-person glyph is **not** carried over: it encodes the same
 * fact the badge over the banner states in words, two inches apart.
 */
export function ChannelLiveNow({ channel }: { channel: Channel }) {
    const events = liveEvents(channel)
    if (events.length === 0) return null

    return (
        <div className="flex min-w-0 flex-col gap-3">
            {events.map(event => (
                <ChannelLiveItem key={event.code ?? event.title} event={event} channel={channel} />
            ))}
        </div>
    )
}

function ChannelLiveItem({ event, channel }: { event: ChannelEvent; channel: Channel }) {
    const { t, currentLanguage } = useTranslation()
    const slug = channel.slug
    /*
     * The card carries **two** destinations, so it cannot be one anchor: the header goes to the
     * space, the banner and the title go to the stream. Legacy splits it the same way. It also has
     * to stay split for a second reason — the overflow menu is a `<button>`, and a button inside an
     * anchor is invalid HTML the browser "fixes" by hoisting it out.
     */
    /*
     * A stream the website may not play gets no link at all — it gets a dialog saying so, at the
     * press rather than one page later. `appLink` is what that dialog offers instead; with neither
     * a link nor an app URL there is nothing to open, so the card is inert.
     */
    const restrictedTo = isPlatformRestricted(event) ? appLink(event) : null
    const href =
        restrictedTo === null && event.code
            ? `/@${slug}/event/${encodeURIComponent(event.code)}`
            : null
    const channelHref = `/@${slug}`
    const name = channel.name ?? slug
    /*
     * `started_at` — when it actually went on air — with the scheduled time behind it. Legacy's home
     * card prints the same field, and it is the honest one: a stream that starts twenty minutes late
     * otherwise advertises a time that has already passed. A scheduled event has only `start_at`.
     */
    const [restrictedOpen, setRestrictedOpen] = useState(false)

    const shownAt = event.started_at ?? event.start_at
    const startAt = formatActivityDateTime(shownAt, currentLanguage)

    return (
        <div className="flex min-w-0 flex-col gap-3">
            <div className="flex min-w-0 items-center gap-2">
                {/*
                 * Hidden from assistive tech **on purpose**: the name beside it is the same link, and
                 * two anchors to one place are announced twice. `tabIndex={-1}` keeps it out of the
                 * tab order for the same reason, so what is left is a mouse target on the picture.
                 *
                 * ⚠ This carried a `biome-ignore lint/a11y/useAnchorContent` while it was a bare
                 * `<a>`. The rule does not see a `<Link>`, so the suppression became dead — and
                 * biome reports an unused one, which is how it was caught. The *reason* it existed
                 * still holds and is the paragraph above; only the rule stopped firing.
                 */}
                <Link href={channelHref} className="flex-none" tabIndex={-1} aria-hidden="true">
                    {/* 40, legacy's size — `medium` is the DS step that is exactly that. */}
                    <AnimatedAvatar
                        size="medium"
                        thumb={channel.images.thumb}
                        avatarVideo={channel.images.avatar_video}
                        isPremium={channel.is_premium}
                        alt=""
                        initials={name.slice(0, 2).toUpperCase()}
                    />
                </Link>

                <div className="flex min-w-0 flex-1 flex-col">
                    <div className="flex min-w-0 items-center gap-1">
                        {/*
                         * The name is the link and the avatar beside it is `aria-hidden` — two
                         * anchors to the same place, announced twice, is noise to a screen reader.
                         * Legacy wraps both and gets exactly that.
                         *
                         * Both text runs truncate rather than taking legacy's fixed 35% caps: with
                         * a cap, a short name still surrenders two thirds of the row to nothing.
                         */}
                        <Link
                            data-testid="channel-live-channel-link"
                            href={channelHref}
                            className="type-dense-strong min-w-0 truncate text-(--text-title)"
                        >
                            {name}
                        </Link>
                        <ChannelVerifiedMark channel={channel} size={16} />
                        <span className="type-caption-meta min-w-0 truncate text-(--text-body)">
                            @{slug}
                        </span>
                    </div>
                    {startAt && (
                        <time
                            dateTime={shownAt ?? undefined}
                            className="type-caption-meta min-w-0 truncate text-(--text-placeholder)"
                        >
                            {startAt}
                        </time>
                    )}
                </div>

                {/* Share and QR. It renders nothing without a `code`, which is the same condition
                    that leaves the card unlinked below. */}
                <ChannelEventMenu event={event} slug={slug} />
            </div>

            <LiveMedia
                event={event}
                href={href}
                onRestricted={restrictedTo ? () => setRestrictedOpen(true) : null}
            />

            {event.title &&
                (href ? (
                    <Link data-testid="channel-live-title-link" href={href} className="min-w-0">
                        <LiveTitle title={event.title} />
                    </Link>
                ) : restrictedTo ? (
                    // A button, not a link: it opens a dialog and navigates nowhere, so announcing
                    // it as a link would promise a destination it does not have.
                    <button
                        data-testid="channel-live-restricted"
                        type="button"
                        className="min-w-0 text-start"
                        onClick={() => setRestrictedOpen(true)}
                    >
                        <LiveTitle title={event.title} />
                    </button>
                ) : (
                    <LiveTitle title={event.title} />
                ))}

            {restrictedTo && (
                <ChannelLiveRestrictedDialog
                    open={restrictedOpen}
                    onOpenChange={setRestrictedOpen}
                    url={restrictedTo}
                />
            )}

            {!event.title && !href && <span className="sr-only">{t('channel_event_live')}</span>}
        </div>
    )
}

/**
 * 16/700 in legacy; `type-body-strong` is the DS's 16/600, per CLAUDE.md's rule that the DS wins on
 * type. Two lines then ellipsis — a stream title is not a headline.
 */
function LiveTitle({ title }: { title: string }) {
    return <p className="type-body-strong line-clamp-2 min-w-0 text-(--text-title)">{title}</p>
}

function LiveMedia({
    event,
    href,
    onRestricted,
}: {
    event: ChannelEvent
    href: string | null
    /** Set when the website may not play this stream — the press explains instead of navigating. */
    onRestricted: (() => void) | null
}) {
    const { t, currentLanguage } = useTranslation()
    const access = liveAccess(event)
    const banner = event.images.banner
    const media = (
        <div className="relative aspect-video w-full overflow-hidden rounded-(--radius-lg) bg-(--background-segment)">
            {banner ? (
                <Image
                    src={banner}
                    alt=""
                    fill
                    sizes="(max-width: 900px) 100vw, 612px"
                    className="object-cover"
                />
            ) : (
                // No banner is ordinary — the creator has not uploaded art. Legacy paints a
                // translucent black plate here for the same reason: the flag needs a backdrop.
                <div className="flex size-full items-center justify-center text-(--text-placeholder)">
                    <Icon name="signal-stream" weight="filled" size={32} />
                </div>
            )}
            {/*
             * Top-left, inset by 8 — legacy's `CardMedia` padding. Over artwork nobody controls, so
             * it sits on the banner rather than beside it, which is the whole point of the flag
             * being a filled pill.
             */}
            <div className="absolute start-2 top-2">
                <ChannelLiveBadge />
            </div>
            {access && (
                /*
                 * Bottom-trailing, over the art — legacy's own corner. The paint is the DS's
                 * `Badge/Overlay` (2039:6980): `--opacity-labels-55` behind, a 1px inset
                 * `--opacity-white-25` stroke, radius fill, 12 Medium in `--text-on-accent`.
                 * Legacy hardcodes `#00000080` and `#FFFFFF80` for the same two, and the DS pair
                 * is what keeps it legible over both a bright banner and a dark one.
                 */
                <div className="absolute end-2 bottom-2 inline-flex h-6 items-center gap-1 rounded-(--radius-fill) bg-(--opacity-labels-55) px-2 text-(--text-on-accent) shadow-[inset_0_0_0_1px_var(--opacity-white-25)]">
                    <Icon name="lock-simple" size={16} />
                    <span className="type-caption-label">
                        {t(access.key, {
                            price:
                                access.price === null
                                    ? ''
                                    : new Intl.NumberFormat(currentLanguage).format(access.price),
                        })}
                    </span>
                    {/* The Star mark rides with the figure, as it does everywhere a price is
                        named in this app — never a bare number. */}
                    {access.price !== null && <StarMark size={16} />}
                </div>
            )}
        </div>
    )

    if (!href) {
        if (!onRestricted) return media
        return (
            <button
                data-testid="channel-live-card-restricted"
                type="button"
                onClick={onRestricted}
                className="block min-w-0 text-start"
            >
                {media}
            </button>
        )
    }

    return (
        <Link
            data-testid="channel-live-card-link"
            href={href}
            className="min-w-0 transition-opacity hover:opacity-90"
        >
            {media}
            {/*
             * Real content rather than an `aria-label`: some assistive tech ignores the attribute on
             * a link and announces the href instead, which reads out as a URL. Same rule, and the
             * same fix, as `ChannelEventCard`'s overlay link.
             */}
            <span className="sr-only">{event.title}</span>
        </Link>
    )
}
