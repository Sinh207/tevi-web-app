'use client'

import { VerifiedBadge } from '@shared/components/verified-badge'
import { useTranslation } from '@shared/i18n/use-translation'
import { GIFT_BOB, GIFT_IN, GIFT_OUT, GIFT_OUT_MS, POP } from '@shared/lib/motion'
import { cn, formatCount } from '@shared/lib/utils'
import { Avatar, AvatarInitials } from '@shared/ui/avatar'
import Image from 'next/image'
import { type CSSProperties, useEffect, useState } from 'react'
import type { GiftBurst } from '../lib/gift-burst'
import { giftThumb } from '../lib/live-message'
import { EVENT_STUDIO_GIFT_VARS } from '../lib/studio'

/**
 * **The gift banners** — the strip that flies in at the leading edge of the stage when somebody
 * sends something.
 *
 * ```
 * ╭───────────────────────────────────────────╮
 * │ ◍  Leslie Alexander ✓            🌹  x12  │   ← 366 × 45, rounded on the leading edge only
 * │    Sent Rose                              │
 * ╰───────────────────────────────────────────╯
 * ```
 *
 * Legacy's `leftPanel/giveGift`. What it draws is the same; what it *is* is different, and the
 * difference is `lib/gift-burst.ts`: every rule about grouping, accumulating and expiring lives in
 * a pure fold, so this file has no timers, no refs and no `Set` of ids mid-exit. It renders a list.
 *
 * ## The ground is a backend URL, and it may never reach a CSS `url(…)`
 *
 * `gift_data.anim_background` is chosen by the backend, and interpolating it into a
 * `background-image` is a CSS-injection sink — a `)` in the string closes the function and
 * everything after it parses as further declarations. There is no `CSS.escape` for a URL (that
 * function escapes *identifiers* and mangles real links). Legacy does exactly this. Here it is a
 * `next/image` with `fill`, which is also what `EventStudioScreen`'s backdrop note argues.
 *
 * ## Motion: in, alive, out
 *
 * Figma has no motion layer (`shared/lib/motion.ts`), and legacy's six keyframe sets on one banner
 * (`slideInRight`, `slideOutLeft`, `scaleUpDown`, `rotateBounce`, `fadeInUp`, `pulse`) are its own
 * inventions. This has three moments, each one animation:
 *
 * - **in** — `GIFT_IN`, thrown in from the leading edge and settling; the gift pops a beat after;
 * - **alive** — the gift drifts (`GIFT_BOB`) and the figure punches on every bump (`POP`);
 * - **out** — `GIFT_OUT`, started `GIFT_OUT_MS` before the burst expires, so the banner leaves
 *   instead of vanishing. A bump while it is leaving extends `expiresAt`, and the banner simply
 *   stays — it does not replay its entrance.
 */

/** Legacy's 366-wide plate, a touch taller (48) so the gift can stand proud of it. */
// `isolate`: the ground's `-z-10` stays behind *this* banner, never another one or the video.
const BANNER = 'relative isolate flex h-12 w-[366px] items-center gap-2.5 ps-1 pe-3'

function GiftBanner({ burst }: { burst: GiftBurst }) {
    const { t } = useTranslation()
    const ground = burst.gift?.anim_background ?? null
    const thumb = giftThumb(burst.gift)
    const name = burst.user?.name ?? t('event_gift_someone')
    const avatar = burst.user?.avatar

    /*
     * `entered` once the entrance has played, so a bump that pulls a leaving banner back does not
     * throw it in a second time; `leaving` from `GIFT_OUT_MS` before it expires. Re-armed on every
     * `expiresAt`, which is what a bump moves.
     */
    const [entered, setEntered] = useState(false)
    const [leaving, setLeaving] = useState(false)
    useEffect(() => {
        setLeaving(false)
        const timer = setTimeout(
            () => setLeaving(true),
            Math.max(0, burst.expiresAt - Date.now() - GIFT_OUT_MS),
        )
        return () => clearTimeout(timer)
    }, [burst.expiresAt])

    return (
        <div
            data-testid="event-gift-float-item"
            data-card-id={burst.key}
            onAnimationEnd={e => {
                if (e.target === e.currentTarget) setEntered(true)
            }}
            className={cn(
                BANNER,
                // The direction both slides travel; flipped so the card keeps to its own edge in
                // Arabic. See `tevi-gift-in`.
                '[--gift-dir:1] rtl:[--gift-dir:-1]',
                leaving ? GIFT_OUT : !entered && GIFT_IN,
            )}
        >
            {/*
             * **The ground is its own clipped layer**, so the gift and the figure are free to stand
             * proud of the plate. Rounded on the **leading** edge only — legacy's `400px 0 0 400px`,
             * as a logical radius so it still points away from the edge it flies in from in Arabic —
             * and the trailing edge **fades** rather than being cut: legacy's artwork stopped dead
             * at 366px, a hard vertical edge in the middle of the stage.
             */}
            <div
                aria-hidden
                className={cn(
                    'absolute inset-0 -z-10 overflow-hidden rounded-s-full',
                    '[mask-image:linear-gradient(to_right,black_62%,transparent)]',
                    'rtl:[mask-image:linear-gradient(to_left,black_62%,transparent)]',
                )}
            >
                {ground ? (
                    <Image src={ground} alt="" fill sizes="366px" className="object-cover" />
                ) : (
                    // A gift with no artwork of its own: the room's glass, so the white text never
                    // sits straight on the video.
                    <div className="absolute inset-0 bg-black/45 backdrop-blur-sm" />
                )}
                {/* A soft dark wash under the name, whatever the artwork is doing behind it. */}
                <div className="absolute inset-0 bg-linear-to-r from-black/35 via-black/10 to-transparent rtl:bg-linear-to-l" />
            </div>

            <Avatar
                size="small"
                type={avatar ? 'image' : 'initials'}
                className="size-10 flex-none shadow-[0_2px_8px_rgba(0,0,0,0.35)] ring-2 ring-white/80"
            >
                {avatar ? (
                    <Image
                        src={avatar}
                        alt=""
                        width={40}
                        height={40}
                        className="size-full rounded-full object-cover"
                    />
                ) : (
                    <AvatarInitials>{name.slice(0, 2).toUpperCase()}</AvatarInitials>
                )}
            </Avatar>

            <div className="flex min-w-0 flex-1 flex-col justify-center drop-shadow-[0_1px_2px_rgba(0,0,0,0.45)]">
                {/* 14/600 — legacy's own. `type-dense-strong` is the DS's 14/semibold; `-emphasis`
                    is 14/medium and reads a step light against the banner's busy ground. */}
                <p className="flex min-w-0 items-center gap-1">
                    <span className="type-dense-strong truncate text-(--live-gift-sender)">
                        {name}
                    </span>
                    {burst.user?.verified_tick_badge?.image && (
                        <VerifiedBadge image={burst.user.verified_tick_badge.image} size={14} />
                    )}
                </p>
                {/* 12/500 — legacy's `fontSize: 12, fontWeight: 500`. */}
                <p className="type-caption-label truncate text-(--live-gift-sentence)">
                    {t('event_gift_float_sent', { name: burst.gift?.name ?? '' })}
                </p>
            </div>

            <div className="flex flex-none items-center gap-1.5">
                {thumb && (
                    /*
                     * Pops a beat after the plate lands, then drifts. 56px against a 48px plate, so
                     * it stands proud of it — the gift is the subject of the banner, and at 45px
                     * inside a clipped plate it read as a sticker on the edge.
                     */
                    <span className={cn('-my-2 flex', POP, '[animation-delay:140ms]')}>
                        <Image
                            src={thumb}
                            alt=""
                            aria-hidden
                            width={56}
                            height={56}
                            className={cn(
                                'size-14 object-contain drop-shadow-[0_4px_8px_rgba(0,0,0,0.4)]',
                                GIFT_BOB,
                            )}
                        />
                    </span>
                )}
                {/*
                 * ⚠ **Keyed on `bumps`**, which is the whole reason that counter exists: CSS
                 * cannot restart an animation on a node already playing one, and remounting is
                 * the only thing that does. `gift-burst.ts` states it from the other side.
                 */}
                <span
                    key={burst.bumps}
                    className={cn(
                        POP,
                        'text-[28px] font-black italic leading-none text-white',
                        // A warm glow behind the outline, so the figure reads as the payoff.
                        'drop-shadow-[0_0_10px_rgba(255,190,40,0.55)]',
                    )}
                    style={
                        {
                            // The four-corner outline, so the figure survives a light ground —
                            // see `--live-gift-amount-edge`.
                            textShadow: `1px 1px 0 var(--live-gift-amount-edge),
                                -1px 1px 0 var(--live-gift-amount-edge),
                                1px -1px 0 var(--live-gift-amount-edge),
                                -1px -1px 0 var(--live-gift-amount-edge)`,
                        } as CSSProperties
                    }
                >
                    x{formatCount(burst.amount)}
                </span>
            </div>
        </div>
    )
}

/**
 * The stack.
 *
 * `aria-live="polite"` and nothing else: the banners are decorative in the sense that the same
 * event is already a line in the transcript, but a blind reader watching a broadcast should still
 * be told that somebody gave something — politely, and never interrupting.
 *
 * `pointer-events-none` throughout: this floats over the stage, and a banner that swallowed a
 * click would eat a press aimed at the video under it.
 */
export function EventGiftFloat({
    bursts,
    className,
    testId,
}: {
    bursts: GiftBurst[]
    className?: string
    testId?: string
}) {
    if (bursts.length === 0) return null

    return (
        <div
            data-testid={testId}
            aria-live="polite"
            style={EVENT_STUDIO_GIFT_VARS as CSSProperties}
            className={cn(
                // `isolate` so the banners' `-z-10` grounds stay inside this stack. Not clipped: the
                // gift stands proud of its plate, and the entrance starts 40px outside the edge.
                'pointer-events-none isolate flex max-w-full flex-col gap-3',
                className,
            )}
        >
            {bursts.map(burst => (
                <GiftBanner key={burst.key} burst={burst} />
            ))}
        </div>
    )
}
