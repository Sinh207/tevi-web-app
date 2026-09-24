'use client'

import type { useChannel } from '@features/channel'
import { useMyChannel } from '@features/channel'
import { BecomeAMemberDialogs, type MembershipTarget, useJoinFlow } from '@features/membership'
import { PREMIUM_PATH } from '@features/premium/routes'
import { useTranslation } from '@shared/i18n/use-translation'
import { cn } from '@shared/lib/utils'
import Image from 'next/image'
import Link from 'next/link'
import type { CSSProperties, ReactNode } from 'react'
import { EVENT_ART } from '../lib/illustrations'

/**
 * Legacy's gold hairline, verbatim (`btnPremiumOrMembership`, `GRADIENT_BORDER`). Drawn here as a
 * 1px padded ground behind the button rather than legacy's masked `::before`, which needs
 * `mask-composite` and a pseudo-element to say the same thing.
 */
const GOLD =
    'linear-gradient(50.8deg, #A56612 20.42%, #E6B31B 29.66%, #E7B92B 31.8%, #ECCA54 35.35%, #F2DF89 39.62%, #E6B31B 48.15%, #E6B31B 54.55%, #E7B92B 58.81%, #ECCA54 65.92%, #F2DF89 74.46%, #E9BF39 83.7%, #EBC952 86.54%, #F2DF89 91.52%)'

/** Legacy's three grounds and inks — literal, as all studio furniture is (`lib/studio.ts`). */
const MEMBERSHIP_BG = '#FFB701'
const PREMIUM_BG = '#501BC0'
const PREMIUM_INK = '#FFCC1A'

type Channel = NonNullable<ReturnType<typeof useChannel>['channel']>

/**
 * **Get Membership / Get Premium** — the upsell in the studio's channel plate, after *Follow*.
 *
 * Legacy's `channelTopBar/btnPremiumOrMembership`, and its four branches are the whole design:
 *
 * ```
 * not following, or already member AND premium  → nothing
 * neither member nor premium, space sells a tier → [ ◆ Get Membership ╱ ✦ Get Premium ]   (split)
 * not a member, space sells a tier               → [ ◆ Get Membership ]
 * otherwise                                      → [ ✦ Get Premium ]
 * ```
 *
 * ⚠ **It exists only for a follower.** That is legacy's first line, and it is why this sits beside
 * *Follow* rather than in the chrome: the button is the step *after* following. `isViewerKnown`
 * gates it for the same reason it gates Follow — the space body is seeded anonymously, so its first
 * render says `is_followed: false` for everybody (see `event-studio-channel-actions.tsx`).
 *
 * "Premium" is the **reader's** Tevi Premium (`useMyChannel().isPremium`, legacy's
 * `myChannel.is_premium`), not the creator's.
 *
 * ## Two deliberate differences
 *
 * - **Membership opens the join dialog in place**, as the gift tray's Membership tile does — legacy
 *   opens `/@slug?action=become_a_member` in a new tab, leaving the stream playing in the one the
 *   reader just left. Whether a tier is on offer is `useJoinFlow`'s `canOffer`, the port's one rule
 *   for it (Star-priced, not already held).
 * - **Premium keeps legacy's new tab.** `/premium` is a whole screen, not a dialog, and following a
 *   link to it in this tab would end the broadcast the reader is watching.
 */
export function EventStudioUpsell({
    channel,
    isViewerKnown,
}: {
    channel: Channel
    isViewerKnown: boolean
}) {
    const { t } = useTranslation()
    const { isPremium } = useMyChannel()
    const target: MembershipTarget = {
        slug: channel.slug,
        name: channel.name ?? null,
        id: channel.id ?? null,
        avatarUrl: channel.images?.thumb ?? null,
    }
    const isFollowed = isViewerKnown && Boolean(channel.is_followed)
    const join = useJoinFlow(target, { enabled: isFollowed && Boolean(target.slug) })

    if (!isFollowed || (isPremium && join.isMember)) return null

    const membership = (split: boolean) => (
        <Half
            testId="event-studio-get-membership"
            ground={MEMBERSHIP_BG}
            ink="#FFFFFF"
            icon={EVENT_ART.getMembership}
            label={t('event_studio_get_membership')}
            side={split ? 'start' : null}
            onClick={join.open}
        />
    )
    const premium = (split: boolean) => (
        <Half
            testId="event-studio-get-premium"
            ground={PREMIUM_BG}
            ink={PREMIUM_INK}
            icon={EVENT_ART.getPremium}
            label={t('event_studio_get_premium')}
            side={split ? 'end' : null}
            href={PREMIUM_PATH}
        />
    )

    const body =
        !isPremium && !join.isMember && join.canOffer ? (
            /*
             * The split: two halves each `calc(50% + 9px)` of a 230px bar, overlapping by 18px and
             * cut on a shared diagonal — legacy's `SplitButton`, with its drop shadow.
             */
            <span className="relative flex h-7 min-w-[230px] flex-none drop-shadow-[0_2px_6px_rgba(0,0,0,0.4)]">
                {membership(true)}
                {premium(true)}
            </span>
        ) : !join.isMember && join.canOffer ? (
            membership(false)
        ) : (
            premium(false)
        )

    return (
        <>
            {body}
            <BecomeAMemberDialogs flow={join} target={target} />
        </>
    )
}

/**
 * One half of the button, or the whole of it when `side` is `null`.
 *
 * The diagonal is a `clip-path`, and clip paths are physical — so each side carries its mirror for
 * RTL, where the membership half sits on the right and the cut leans the other way. Legacy is
 * left-to-right only.
 */
function Half({
    testId,
    ground,
    ink,
    icon,
    label,
    side,
    onClick,
    href,
}: {
    testId: string
    ground: string
    ink: string
    icon: { src: string; width: number; height: number }
    label: string
    side: 'start' | 'end' | null
    onClick?: () => void
    href?: string
}) {
    const inner: ReactNode = (
        <span
            className={cn(
                'flex size-full items-center justify-center gap-1 rounded-[15px]',
                // Legacy's paddings: `6px 8px` whole, and a split half pads only its diagonal
                // side, 10px (`'0 10px 0 0'` / `'0 0 0 10px'`) — the label needs the rest.
                side === null && 'px-2',
                side === 'start' && 'pe-2.5',
                side === 'end' && 'ps-2.5',
            )}
            style={{ background: ground, color: ink } as CSSProperties}
        >
            <Image
                src={icon.src}
                alt=""
                aria-hidden
                width={icon.width}
                height={icon.height}
                className="size-4 flex-none"
            />
            <span className="type-micro-overline truncate tracking-[0.2px]">{label}</span>
        </span>
    )
    const shell = cn(
        'flex h-7 items-stretch rounded-2xl p-px transition-[filter] hover:brightness-110',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white',
        side === null && 'w-fit flex-none',
        side !== null && 'absolute top-0 h-full w-[calc(50%+9px)]',
        side === 'start' &&
            'start-0 rounded-e-none [clip-path:polygon(0_0,100%_0,calc(100%-20px)_100%,0_100%)] rtl:[clip-path:polygon(0_0,100%_0,100%_100%,20px_100%)]',
        side === 'end' &&
            'end-0 rounded-s-none [clip-path:polygon(20px_0,100%_0,100%_100%,0_100%)] rtl:[clip-path:polygon(0_0,calc(100%-20px)_0,100%_100%,0_100%)]',
    )
    const style = { background: GOLD } as CSSProperties

    return href ? (
        // A new tab on purpose — see the component note. `next/link` for the same reasons as any
        // internal link, even though this one does not replace the page it is on.
        <Link
            data-testid={testId}
            href={href}
            target="_blank"
            rel="noopener"
            className={shell}
            style={style}
        >
            {inner}
        </Link>
    ) : (
        <button
            type="button"
            data-testid={testId}
            onClick={onClick}
            className={shell}
            style={style}
        >
            {inner}
        </button>
    )
}
