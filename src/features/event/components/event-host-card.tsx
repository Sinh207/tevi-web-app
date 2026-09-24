'use client'

import { VerifiedBadge } from '@shared/components/verified-badge'
import { useTranslation } from '@shared/i18n/use-translation'
import { cn } from '@shared/lib/utils'
import { Avatar, AvatarInitials, avatarImageClass } from '@shared/ui/avatar'
import { Icon } from '@shared/ui/icon'
import Image from 'next/image'
import Link from 'next/link'
import type { EventChannel } from '../api/types'
import { EVENT_CARD, EVENT_PADDING } from '../lib/container'

/**
 * **Hosted by** — the creator, and the way back to their space.
 *
 * Legacy's `viewer/components/details/host`: a 40px avatar, "Hosted by" over the name, the verified
 * mark, the handle, and a chevron. The whole card is the link.
 *
 * ## A real anchor, not a card with an `onClick`
 *
 * Legacy puts `router.push` on the `<Card>`, which costs the three things an anchor gives for free:
 * it is not middle-clickable, it shows no destination in the status bar, and it is invisible to
 * anything that reads links. This is a navigation, so it is an `<a>` — and the whole card being the
 * target is kept, because that is the affordance the chevron promises.
 *
 * Nothing is drawn without a slug: the card's only purpose is the link, and a version of it that
 * goes nowhere is a chevron pointing at nothing. `normalizeEvent` already refuses a payload with no
 * slug, so this is the belt rather than the braces.
 */
export function EventHostCard({ channel }: { channel: EventChannel }) {
    const { t } = useTranslation()
    if (!channel.slug) return null

    const name = channel.name ?? `@${channel.slug}`
    /*
     * The URL straight from the payload, through `next/image` — **not** `thumborSquareUrl`.
     *
     * That helper is transitively **server-only** (it reads `serverEnv()`), which is written on it
     * and is easy to miss because it looks like a pure string builder: importing it here compiled,
     * type-checked, and then failed at *dev-server* time with a `server-only` trace three modules
     * deep. It exists for the two sinks the optimiser cannot serve — a PWA manifest icon and an
     * `apple-touch-icon` — and an avatar in a card is not one of them.
     *
     * `next/image` handles this correctly anyway: 40px at a fixed size, cropped by `object-cover`,
     * which is what every other avatar in a client component does (`AnimatedAvatar`, the following
     * rows).
     */
    const thumb = channel.images.thumb

    return (
        <Link
            data-testid="event-host"
            href={`/@${encodeURIComponent(channel.slug)}`}
            className={cn(
                'group flex min-w-0 items-center gap-3 transition-colors',
                EVENT_CARD,
                EVENT_PADDING,
                'md:hover:bg-(--background-subtle)',
            )}
        >
            <Avatar size="large" type={thumb ? 'image' : 'initials'} className="flex-none">
                {thumb ? (
                    <Image src={thumb} alt="" width={40} height={40} className={avatarImageClass} />
                ) : (
                    <AvatarInitials>
                        {channel.slug.replace('@', '').slice(0, 2).toUpperCase()}
                    </AvatarInitials>
                )}
            </Avatar>

            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="type-caption-meta text-(--text-subtitle)">
                    {t('event_hosted_by')}
                </span>
                <span className="flex min-w-0 items-center gap-1">
                    {/*
                     * The name truncates and the handle does not shrink below its own width: with
                     * both allowed to shrink, a long display name squeezes `@slug` to an ellipsis
                     * and the row loses the one part of it that is unique.
                     */}
                    <span className="type-dense-strong min-w-0 truncate text-(--text-title)">
                        {name}
                    </span>
                    {channel.verified_tick_badge?.image && (
                        <VerifiedBadge image={channel.verified_tick_badge.image} size={16} />
                    )}
                    <span className="type-caption-meta flex-none text-(--text-placeholder)">
                        @{channel.slug}
                    </span>
                </span>
            </div>

            {/* `rtl:-scale-x-100` is this app's mirror for a directional glyph — the sprite has one
                drawing and the flip is CSS. Same class the drawer's rows and `PageBackBar` use. */}
            <Icon
                name="angle-right"
                size={16}
                className="flex-none text-(--icon-secondary) rtl:-scale-x-100"
            />
        </Link>
    )
}
