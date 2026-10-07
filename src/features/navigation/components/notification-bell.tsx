'use client'

import { useMayAnimate } from '@shared/hooks/use-may-animate'
import { useTranslation } from '@shared/i18n/use-translation'
import { PING, POP } from '@shared/lib/motion'
import { cn } from '@shared/lib/utils'
import { Icon } from '@shared/ui/icon'
import { useEffect, useRef } from 'react'

/** Past this the badge reads `99+` — a count nobody acts on digit by digit, in a 16px pill. */
const MAX_SHOWN = 99

/**
 * The swing a bell gives when it rings — hinged at the top, damped over three beats. Web Animations
 * rather than a `@keyframes` in `globals.css`: it fires on an event (the count going up), not on a
 * class, and it keeps the motion beside the one element that uses it.
 */
const RING: Keyframe[] = [
    { rotate: '0deg' },
    { rotate: '14deg', offset: 0.15 },
    { rotate: '-12deg', offset: 0.32 },
    { rotate: '8deg', offset: 0.5 },
    { rotate: '-5deg', offset: 0.68 },
    { rotate: '2deg', offset: 0.84 },
    { rotate: '0deg' },
]

/**
 * The top bar's bell and its unread badge — the glyph and what sits on it, as one unit.
 *
 * ## A count, not a dot
 *
 * The inbox query already knows *how many* (`useUnreadInbox().count`), and "3" says more than a red
 * dot at no cost in space: a 16px pill (`99+` past ninety-nine, in the reader's numerals), parked
 * on the bell's top-trailing shoulder and growing towards the trailing edge, so one digit or three
 * it never covers the glyph's body. Lit from above (a lighter top on `--badge-bg`), with a soft glow
 * in its own red rather than a grey shadow, and a 2px cut-out in the bar's surface so it reads as a
 * separate object against the bell in both themes.
 *
 * ## Motion — only when something arrives
 *
 * - **The badge pops in** (`POP`) when it first appears, and pops again whenever the count changes,
 *   because it is keyed on the count.
 * - **A ripple leaves it** (`PING`, one ring, rests invisible) on the same key — "that just
 *   arrived".
 * - **The bell rings** — one damped swing from its top — only when the count goes **up** while the
 *   page is open. Not on the first answer: a bell that rings at every page load is noise, and
 *   reading notifications (count going down) is not news.
 *
 * Nothing loops. Under reduced motion (`useMayAnimate`, which also honours data-saver) the bell
 * does not swing, and `POP` / `PING` carry their own `motion-reduce` fallbacks.
 *
 * Decorative to assistive tech: the button's own label names the destination, and the count is
 * announced by the inbox screen itself.
 */
export function NotificationBell({ count }: { count: number }) {
    const { currentLanguage } = useTranslation()
    const mayAnimate = useMayAnimate()
    const bell = useRef<HTMLSpanElement>(null)
    // `null` until the first answer, so the first count is a baseline rather than "news".
    const previous = useRef<number | null>(null)

    useEffect(() => {
        const before = previous.current
        previous.current = count
        if (before === null || count <= before || !mayAnimate) return
        bell.current?.animate?.(RING, { duration: 800, easing: 'ease-out' })
    }, [count, mayAnimate])

    const shown =
        count > MAX_SHOWN
            ? `${new Intl.NumberFormat(currentLanguage).format(MAX_SHOWN)}+`
            : new Intl.NumberFormat(currentLanguage).format(count)

    return (
        <>
            <span ref={bell} className="flex origin-top">
                <Icon name="bell" size={22} />
            </span>
            {count > 0 && (
                <span
                    aria-hidden="true"
                    // The bell's shoulder: the 22px glyph is centred in 44, so it spans 11–33.
                    // The pill starts at 23 and grows towards the trailing edge.
                    className="pointer-events-none absolute start-[23px] top-[5px] flex"
                >
                    <span
                        key={`ping-${count}`}
                        className={cn('absolute inset-0 rounded-full bg-(--badge-bg)', PING)}
                    />
                    <span
                        key={`pop-${count}`}
                        className={cn(
                            'type-micro-overline relative flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-(--white) tabular-nums',
                            'bg-[linear-gradient(180deg,color-mix(in_srgb,var(--badge-bg)_78%,var(--white)),var(--badge-bg))]',
                            'shadow-[0_0_0_2px_var(--background-surface),0_3px_8px_-2px_color-mix(in_srgb,var(--badge-bg)_60%,transparent)]',
                            POP,
                        )}
                    >
                        {shown}
                    </span>
                </span>
            )}
        </>
    )
}
