'use client'

import { useTranslation } from '@shared/i18n/use-translation'
import { POP, RISE } from '@shared/lib/motion'
import { cn, formatCount } from '@shared/lib/utils'
import { Avatar, AvatarInitials } from '@shared/ui/avatar'
import Image from 'next/image'
import type { CSSProperties } from 'react'
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
 * ## Motion is the app's own, not legacy's six keyframe sets
 *
 * Figma has no motion layer (`shared/lib/motion.ts`), so legacy's `slideInRight`, `slideOutLeft`,
 * `scaleUpDown`, `rotateBounce`, `fadeInUp` and `pulse` are inventions too — six of them, on one
 * banner. `RISE` for the banner and `POP` for the figure that just changed are the app's two, they
 * carry `motion-reduce:animate-none` for free, and they add no `@keyframes` to `globals.css`.
 */

/** Legacy's geometry, verbatim: a 366×45 plate with 4px of padding. */
const BANNER = 'relative flex h-[45px] w-[366px] items-center gap-2 p-1'

function GiftBanner({ burst }: { burst: GiftBurst }) {
    const { t } = useTranslation()
    const ground = burst.gift?.anim_background ?? null
    const thumb = giftThumb(burst.gift)
    const name = burst.user?.name ?? t('event_gift_someone')
    const avatar = burst.user?.avatar

    return (
        <div
            data-testid="event-gift-float-item"
            data-card-id={burst.key}
            className={cn(
                BANNER,
                RISE,
                /*
                 * Rounded on the **leading** edge only — legacy's `400px 0 0 400px`, as a logical
                 * radius so the banner still points away from the edge it flies in from in Arabic.
                 * `overflow-hidden` is what clips the ground image to that shape.
                 */
                'overflow-hidden rounded-s-[400px]',
                // The fallback ground, for a gift with no artwork of its own. Without it the plate
                // is transparent and the white text sits directly on the video.
                !ground && 'bg-black/40 backdrop-blur-sm',
            )}
        >
            {ground && (
                <Image
                    src={ground}
                    alt=""
                    aria-hidden
                    fill
                    sizes="366px"
                    className="-z-10 object-cover"
                />
            )}

            <Avatar
                size="small"
                type={avatar ? 'image' : 'initials'}
                className="size-[37px] flex-none"
            >
                {avatar ? (
                    <Image
                        src={avatar}
                        alt=""
                        width={37}
                        height={37}
                        className="size-full rounded-full object-cover"
                    />
                ) : (
                    <AvatarInitials>{name.slice(0, 2).toUpperCase()}</AvatarInitials>
                )}
            </Avatar>

            <div className="flex min-w-0 flex-1 flex-col justify-center">
                {/* 14/600 — legacy's own. `type-dense-strong` is the DS's 14/semibold; `-emphasis`
                    is 14/medium and reads a step light against the banner's busy ground. */}
                <p className="type-dense-strong truncate text-(--live-gift-sender)">{name}</p>
                {/* 12/500 — legacy's `fontSize: 12, fontWeight: 500`. `type-caption-default`,
                    which this said, is not a utility the DS ships; see the panel's note. */}
                <p className="type-caption-label truncate text-(--live-gift-sentence)">
                    {t('event_gift_float_sent', { name: burst.gift?.name ?? '' })}
                </p>
            </div>

            <div className="flex flex-none items-center gap-1 pe-4">
                {thumb && (
                    <Image
                        src={thumb}
                        alt=""
                        aria-hidden
                        width={45}
                        height={45}
                        className="size-[45px] object-contain"
                    />
                )}
                {/*
                 * ⚠ **Keyed on `bumps`**, which is the whole reason that counter exists: CSS
                 * cannot restart an animation on a node already playing one, and remounting is
                 * the only thing that does. `gift-burst.ts` states it from the other side.
                 */}
                <span
                    key={burst.bumps}
                    className={cn(POP, 'text-[28px] font-black italic leading-none text-white')}
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
                'pointer-events-none flex max-w-full flex-col gap-2 overflow-hidden',
                className,
            )}
        >
            {bursts.map(burst => (
                <GiftBanner key={burst.key} burst={burst} />
            ))}
        </div>
    )
}
