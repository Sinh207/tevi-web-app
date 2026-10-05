import { LIVE_BREATH, LIVE_RING_SPIN } from '@shared/lib/motion'
import { cn } from '@shared/lib/utils'
import type { ReactNode } from 'react'

/**
 * **The live ring's three stops** — Figma `.❖ Main / Avatar` (Live, file `[Tevi Web App] 3. Live`):
 * violet → rose → orange, left to right. The `Live` pill under the ring is filled with it as drawn.
 */
export const LIVE_GRADIENT = 'linear-gradient(90deg, #8B5CF6 0%, #E11D48 50%, #F97316 100%)'

/**
 * The same stops as a closed **conic** sweep, for the ring itself. The ring turns, and a turning
 * linear gradient reads as a lopsided ring — heavy on whichever side the orange has reached. A sweep
 * that returns to its own start is even at every angle.
 */
export const LIVE_RING_GRADIENT =
    'conic-gradient(from 210deg, #8B5CF6, #E11D48, #F97316, #E11D48, #8B5CF6)'

/**
 * **A face that is live** — the gradient ring, a clear gap, and the `Live` pill on its foot.
 *
 * Drawn **outside** its child and taking no layout, like the CSS `ring` it replaces: the avatar
 * keeps the size its DS slot measured, and whatever was aligned to it stays aligned. Two custom
 * properties size it, so a caller can make it responsive with ordinary variants:
 *
 * - `--live-ring` — the gradient's thickness (default 3px);
 * - `--live-gap` — the clear band between ring and face (default 3px), painted `--live-ground`.
 *
 * `--live-ground` is **whatever the avatar sits on** (default `--background-surface`): Figma's gap
 * is white because that frame sits on a white page, so the honest port is "the ground", not white.
 * The pill's edge is the same ink, so it reads as cut out of the ring rather than stuck on it.
 *
 * Motion: the ring and a blurred copy of it turn together (3s), and the copy breathes, so the face
 * glows rather than flashes. Under reduced motion the ring holds still on its first frame.
 *
 * Decorative (`aria-hidden`) except the pill's word, which the caller passes translated — the face
 * belongs to a link or a heading that names it, and "Live" is the one fact this adds.
 */
export function LiveRing({
    label,
    className,
    children,
}: {
    /** The pill's word — `channel_event_live`. `null` draws the ring alone. */
    label: string | null
    /** Sizing (`[--live-ring:4px]`), the ground (`[--live-ground:#16121F]`), layout. */
    className?: string
    children: ReactNode
}) {
    return (
        <span
            className={cn(
                'relative inline-flex [--live-gap:3px] [--live-ground:var(--background-surface)] [--live-ring:3px]',
                className,
            )}
        >
            <span
                aria-hidden
                className={cn(
                    'pointer-events-none absolute -inset-[calc(var(--live-ring)+var(--live-gap))] rounded-full opacity-70 blur-md',
                    LIVE_BREATH,
                )}
            >
                <span
                    style={{ backgroundImage: LIVE_RING_GRADIENT }}
                    className={cn('absolute inset-0 rounded-full', LIVE_RING_SPIN)}
                />
            </span>
            <span
                aria-hidden
                style={{ backgroundImage: LIVE_RING_GRADIENT }}
                className={cn(
                    'pointer-events-none absolute -inset-[calc(var(--live-ring)+var(--live-gap))] rounded-full',
                    LIVE_RING_SPIN,
                )}
            />
            <span
                aria-hidden
                className="pointer-events-none absolute -inset-(--live-gap) rounded-full bg-(--live-ground)"
            />
            <span className="relative flex">{children}</span>
            {label && (
                /*
                 * Centred on the ring's outer edge by a full-width row, not `start-1/2` and a
                 * translate — that pair needs its sign flipped under RTL, and a caller animating
                 * `scale` on an ancestor would fight a translate on the same element.
                 */
                <span className="pointer-events-none absolute inset-x-0 -bottom-[calc(var(--live-ring)+var(--live-gap))] flex translate-y-1/2 justify-center">
                    <span
                        style={{ backgroundImage: LIVE_GRADIENT }}
                        className="type-caption-label-strong flex h-5 items-center gap-1 rounded-full px-2 whitespace-nowrap text-white shadow-[0_0_0_2px_var(--live-ground),0_4px_10px_rgba(225,29,72,0.35)]"
                    >
                        <span
                            aria-hidden
                            className={cn('size-1 rounded-full bg-white', LIVE_BREATH)}
                        />
                        {label}
                    </span>
                </span>
            )}
        </span>
    )
}
