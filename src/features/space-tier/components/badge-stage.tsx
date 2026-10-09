import { FLOAT, LIVE_BREATH, RIPPLE, TWINKLE } from '@shared/lib/motion'
import { PREMIUM_SPARK_SHAPE } from '@shared/lib/premium-sparkle'
import { cn } from '@shared/lib/utils'
import type { CSSProperties, ReactNode } from 'react'

/**
 * Four sparkles around a badge, at its corners, staggered across one `TWINKLE` cycle so one is
 * always catching the light — the arrangement `home-empty-state.tsx`'s stage uses.
 */
const SPARKLES: { id: string; at: CSSProperties; size: number; delay: number }[] = [
    { id: 'top', at: { insetInlineStart: '10%', top: '4%' }, size: 14, delay: 0 },
    { id: 'end', at: { insetInlineEnd: '2%', top: '30%' }, size: 11, delay: 600 },
    { id: 'start', at: { insetInlineStart: '0%', top: '62%' }, size: 9, delay: 1200 },
    { id: 'bottom', at: { insetInlineEnd: '14%', top: '86%' }, size: 12, delay: 1800 },
]

/**
 * A tier badge, brought to life — the art is one raster from the backend, so the motion is
 * **around** it rather than inside it: a brand glow that breathes behind it, the badge itself on a
 * slow float, sparkles taking turns at its corners, and (for the success step) rings spreading out
 * from it.
 *
 * Every motion is an existing `shared/lib/motion` constant over a keyframe already in
 * `globals.css`, so this adds no CSS — and each one carries its own `motion-reduce` rule: the float
 * and the breath rest, the sparkles and the rings hide, leaving the still badge.
 *
 * `active` switches the decoration off without unmounting the badge, which is what the carousel
 * needs: only the slide in the middle is lit, and a slide moving into the middle must not remount
 * (its image would flash).
 */
export function BadgeStage({
    active = true,
    rings = false,
    className,
    children,
}: {
    active?: boolean
    rings?: boolean
    className?: string
    children: ReactNode
}) {
    return (
        <span className={cn('relative grid place-items-center', className)}>
            <span
                aria-hidden
                className={cn(
                    'pointer-events-none absolute inset-[8%] rounded-full blur-2xl',
                    'bg-[radial-gradient(closest-side,color-mix(in_srgb,var(--primary-300)_80%,transparent),transparent)]',
                    'transition-opacity duration-500 motion-reduce:transition-none',
                    active ? cn('opacity-100', LIVE_BREATH) : 'opacity-0',
                )}
            />
            {rings && active
                ? [0, 800, 1600].map(delay => (
                      <span
                          key={delay}
                          aria-hidden
                          className={cn(
                              'pointer-events-none absolute inset-[14%] rounded-full border-2 border-(--primary-300)',
                              RIPPLE,
                          )}
                          style={{ animationDelay: `${delay}ms` }}
                      />
                  ))
                : null}
            <span
                className={cn(
                    'relative flex size-full items-center justify-center',
                    active && FLOAT,
                )}
            >
                {children}
            </span>
            {active
                ? SPARKLES.map(sparkle => (
                      <span
                          key={sparkle.id}
                          aria-hidden
                          className={cn('pointer-events-none absolute bg-(--text-brand)', TWINKLE)}
                          style={{
                              ...sparkle.at,
                              width: sparkle.size,
                              height: sparkle.size,
                              clipPath: PREMIUM_SPARK_SHAPE,
                              animationDelay: `${sparkle.delay}ms`,
                          }}
                      />
                  ))
                : null}
        </span>
    )
}
