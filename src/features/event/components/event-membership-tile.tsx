'use client'

import { BecomeAMemberDialogs, type MembershipTarget, useJoinFlow } from '@features/membership'
import { useTranslation } from '@shared/i18n/use-translation'
import { cn } from '@shared/lib/utils'
import Image from 'next/image'
import type { CSSProperties } from 'react'
import type { EventDetail } from '../api/types'
import { EVENT_ART } from '../lib/illustrations'
import { EVENT_STUDIO_GIFT_VARS } from '../lib/studio'

/**
 * **The Membership tile** — an 89px card beside the gift tray, offering the space's tier.
 *
 * ```
 * ┌─────────────────────────────────────────────┬──────┐ ┌──────┐
 * │  🌹    👑    🚀    💎    🎁            More ▸│      │ │  👑  │
 * │                                             │      │ │Member│
 * └─────────────────────────────────────────────┴──────┘ └──────┘
 *                        tray: calc(100% − 101px)          89px
 * ```
 *
 * Legacy's `liveSession/.../bottomPanel/membership`, at its own numbers: 89 wide, the tray's
 * `#78787880` ground, 16px radius, 6px of padding, a 40px crown over a 12/600 label. Its presence is
 * what narrows the tray by 101px (89 + the band's 12px gap), which is why it is its own flex item
 * rather than something the tray draws inside itself.
 *
 * ## Two deliberate differences
 *
 * - **The gate is `useJoinFlow`'s `canOffer`, not "the space has any package".** Legacy shows the
 *   tile whenever `subscriptionPackages.length && !mySubscriptions.length`; this port's one shared
 *   rule for "can this reader join right now" also requires the tier to be Star-priced, because a
 *   cash-only tier is a sale this client cannot complete (`docs/PAYMENT.md` §8). Every other join
 *   surface already asks it that way, and a tile that opens a dialog with no finishable action is
 *   the failure the gate exists to prevent.
 * - **It opens the join dialog in place instead of a new window.** Legacy's
 *   `window.open('/@slug?action=become_a_member', '_blank')` leaves the stream playing in a tab the
 *   reader just walked away from. The dialogs are `z-50`, over the studio's `z-40`, so the room and
 *   the purchase can share the screen — the arrangement the mini-app player relies on too.
 *
 * Renders nothing when the gate is shut, so the tray takes the full width, as legacy's does.
 */
export function EventMembershipTile({
    event,
    enabled,
}: {
    event: EventDetail
    /** Only while something is playing — the band this sits in is not drawn otherwise. */
    enabled: boolean
}) {
    const { t } = useTranslation()
    const channel = event.channel
    const target: MembershipTarget = {
        slug: channel?.slug ?? '',
        name: channel?.name ?? null,
        id: channel?.id ?? null,
        avatarUrl: channel?.images.thumb ?? null,
    }
    const join = useJoinFlow(target, { enabled: enabled && Boolean(target.slug) })

    if (!join.canOffer) return null

    return (
        <>
            <button
                type="button"
                data-testid="event-membership-tile"
                onClick={join.open}
                style={EVENT_STUDIO_GIFT_VARS as CSSProperties}
                className={cn(
                    'group flex h-full w-[89px] flex-none flex-col items-center justify-center gap-1',
                    'overflow-hidden rounded-2xl bg-(--live-gift-tray) p-1.5 text-white',
                    // Legacy's hover lift, on the tile rather than the whole band.
                    'transition-[scale,translate,background-color] duration-200',
                    'hover:-translate-y-1 hover:scale-110 hover:bg-(--live-gift-tile-hover)',
                    'motion-reduce:transition-none motion-reduce:hover:translate-y-0 motion-reduce:hover:scale-100',
                    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white',
                )}
            >
                <Image
                    src={EVENT_ART.membershipKing.src}
                    alt=""
                    aria-hidden
                    width={EVENT_ART.membershipKing.width}
                    height={EVENT_ART.membershipKing.height}
                    className="size-10 flex-none"
                />
                <span className="type-caption-label-strong w-full truncate text-center">
                    {t('event_studio_membership')}
                </span>
            </button>
            <BecomeAMemberDialogs flow={join} target={target} />
        </>
    )
}
