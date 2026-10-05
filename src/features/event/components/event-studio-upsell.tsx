'use client'

import type { useChannel } from '@features/channel'
import { useMyChannel } from '@features/channel'
import { BecomeAMemberDialogs, type MembershipTarget, useJoinFlow } from '@features/membership'
import { PREMIUM_PATH } from '@features/premium/routes'
import { useTranslation } from '@shared/i18n/use-translation'
import { PREMIUM_SHEEN, RISE } from '@shared/lib/motion'
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
            <Frame split>
                {membership(true)}
                {premium(true)}
            </Frame>
        ) : !join.isMember && join.canOffer ? (
            <Frame>{membership(false)}</Frame>
        ) : (
            <Frame>{premium(false)}</Frame>
        )

    return (
        <>
            {body}
            <BecomeAMemberDialogs flow={join} target={target} />
        </>
    )
}

/**
 * The gold hairline, drawn **once** around the whole pill — legacy draws one per half, each clipped
 * by its own diagonal, so the outline breaks at the seam and each half's inner rounding shows as a
 * dark notch where the two meet. Here the pill is one rounded clip and the halves are square inside it.
 *
 * The split is a two-column grid at `w-max`, so both halves are as wide as the longer label — legacy
 * pins `min-width: 230px` and lets a longer locale truncate, which the minimum still provides.
 */
function Frame({ split = false, children }: { split?: boolean; children: ReactNode }) {
    return (
        <span
            className={cn(
                'flex h-7 max-w-full flex-none rounded-2xl p-px drop-shadow-[0_2px_6px_rgba(0,0,0,0.4)]',
                // It mounts once the account's follow state lands, after the rest of the plate —
                // so it arrives rather than appears, on the app's entrance.
                RISE,
                // A press gives: the pill sinks 2% under the finger. `scale`, not `transform`.
                'transition-[scale] duration-[160ms] ease-out active:scale-[0.98] motion-reduce:transition-none',
                split ? 'w-max min-w-[230px]' : 'w-fit',
            )}
            style={{ background: GOLD } as CSSProperties}
        >
            <span
                className={cn(
                    'relative isolate min-w-0 flex-1 overflow-clip rounded-[15px]',
                    split ? 'grid grid-cols-2' : 'flex',
                )}
            >
                {children}
                {/*
                 * The glare `/premium`'s plan card and the drawer's premium card already carry —
                 * `PREMIUM_SHEEN`, so the three gold surfaces catch the light on one timing. Inside
                 * the clip, so it crosses both halves and the seam as one object, and last in the
                 * DOM so painting order alone puts it on top. `inset-0` for the RTL reason the
                 * keyframe's note gives; `opacity-0` so reduced motion leaves no band behind.
                 */}
                <span
                    aria-hidden
                    className={cn(
                        'pointer-events-none absolute inset-0 z-10 opacity-0',
                        'bg-[linear-gradient(100deg,transparent_38%,rgba(255,255,255,0.4)_50%,transparent_62%)]',
                        PREMIUM_SHEEN,
                    )}
                />
            </span>
        </span>
    )
}

/**
 * One half of the pill, or the whole of it when `side` is `null`.
 *
 * ⚠ **The diagonal is drawn by the premium half alone**, as two stacked layers that reach 10px
 * into the membership half: gold, then purple 1.5px later, so the gold left showing *is* the
 * seam. Legacy cuts both halves with mirrored `clip-path`s whose edges do not coincide (one runs
 * 50%+9 → 50%−11, the other 50%+11 → 50%−9), which is the 2px dark gap between them. One edge has
 * nothing to disagree with. The layers are children of the premium link, so the wedge they paint is
 * also premium's hit area — what the reader sees is what they press.
 *
 * Clip paths are physical, so the layers carry their mirror for RTL, where premium sits on the left.
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
    const slanted = side === 'end'
    const inner: ReactNode = (
        <>
            {/*
             * The membership ground runs on under the wedge: the premium cell is transparent left
             * of the diagonal, and without this the pill's gold ground shows through there.
             */}
            {side === 'start' && (
                <span
                    aria-hidden
                    className="absolute inset-y-0 start-full w-2.5"
                    style={{ background: ground } as CSSProperties}
                />
            )}
            {slanted && (
                <>
                    <span
                        aria-hidden
                        className={cn(WEDGE, '-start-2.5')}
                        style={{ background: GOLD } as CSSProperties}
                    />
                    <span
                        aria-hidden
                        className={cn(WEDGE, '-start-[8.5px]')}
                        style={{ background: ground } as CSSProperties}
                    />
                </>
            )}
            <Image
                src={icon.src}
                alt=""
                aria-hidden
                width={icon.width}
                height={icon.height}
                className="relative size-4 flex-none"
            />
            {/*
             * Legacy's 10/600. The DS's only 10px style is `type-micro-overline` at 500, so it keeps
             * the size and line height and only the weight is lifted — the same exception the gift
             * banner's figure takes (`event-gift-float.tsx`): studio furniture with no Figma style,
             * literal like its grounds above. `font-semibold` wins over `type-*` because those sit
             * in `@layer components`.
             */}
            <span className="type-micro-overline relative min-w-0 truncate font-semibold tracking-[0.2px]">
                {label}
            </span>
        </>
    )
    const className = cn(
        'relative flex min-w-0 items-center justify-center gap-1 transition-[filter] hover:brightness-110',
        'focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-white',
        // Legacy's `6px 8px` for a whole pill; a split half keeps 10px clear of the diagonal.
        side === null && 'px-2',
        side === 'start' && 'ps-2 pe-3',
        side === 'end' && 'ps-3 pe-2',
    )
    // The premium half's own ground is its wedge, which also has to cover the slant.
    const style = { background: slanted ? undefined : ground, color: ink } as CSSProperties

    return href ? (
        // A new tab on purpose — see the component note. `next/link` for the same reasons as any
        // internal link, even though this one does not replace the page it is on.
        <Link
            data-testid={testId}
            href={href}
            target="_blank"
            rel="noopener"
            className={className}
            style={style}
        >
            {inner}
        </Link>
    ) : (
        <button
            type="button"
            data-testid={testId}
            onClick={onClick}
            className={className}
            style={style}
        >
            {inner}
        </button>
    )
}

/**
 * The slant: 20px across the pill's 26px inner height, legacy's angle. Both layers share it and
 * differ only in where they start — 1.5px apart, which at this angle is a ~1.2px hairline.
 */
const WEDGE = cn(
    'absolute inset-y-0 end-0',
    '[clip-path:polygon(20px_0,100%_0,100%_100%,0_100%)]',
    'rtl:[clip-path:polygon(0_0,calc(100%-20px)_0,100%_100%,0_100%)]',
)
