import { cn } from '@shared/lib/utils'
import type { ReactNode } from 'react'

/**
 * The overshoot a selected glyph lands with, and the indicator slides on — one family of spring for
 * every piece of selection motion in the two navigation bars.
 */
export const NAV_SPRING = 'ease-[cubic-bezier(0.34,1.56,0.64,1)] motion-reduce:transition-none'

/** The indicator's softer spring: it travels further than a glyph scales, so it overshoots less. */
export const NAV_SLIDE =
    'duration-[420ms] ease-[cubic-bezier(0.34,1.36,0.64,1)] motion-reduce:transition-none'

/**
 * The tint behind the current destination — a faint brand gradient with a hairline of its own, so
 * it reads as a raised pill rather than a flat wash. `NAV_TINT` is the paint alone (for a tint that
 * grows in place, like the rail's drawer toggles); `NAV_INDICATOR` adds the absolute positioning a
 * sliding indicator needs. Placement and travel are the caller's.
 */
export const NAV_TINT = cn(
    'bg-[linear-gradient(180deg,color-mix(in_srgb,var(--text-brand)_18%,transparent),color-mix(in_srgb,var(--text-brand)_11%,transparent))]',
    'shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--text-brand)_14%,transparent)]',
)

export const NAV_INDICATOR = cn('pointer-events-none absolute', NAV_TINT)

/**
 * A navigation glyph that **fills** when selected — shared by the mobile tab bar and the desktop
 * rail so both say "here" the same way.
 *
 * Both drawings stay mounted, stacked in one cell, and cross-fade: the outline shrinks away while the
 * selected drawing springs in from half size. The selected drawing is at **full tint** — a duotone
 * glyph paints its body at `--tevi-icon-tint` (0.4 by default), and 40% brand on a brand-tinted
 * indicator washed the glyph into its own background; the DS `Tab Bar` sets it to 1 for exactly this.
 * A soft glow in the brand's own colour sits beneath it, so the glyph sits *on* the indicator rather
 * than in it. Colour is inherited (`currentColor`) — the item sets `--text-brand` when selected.
 */
export function NavGlyph({
    selected,
    idle,
    active,
}: {
    selected: boolean
    idle: ReactNode
    active: ReactNode
}) {
    return (
        <span aria-hidden className="grid size-6 place-items-center">
            <span
                className={cn(
                    'col-start-1 row-start-1 flex transition-[opacity,scale] duration-200 ease-out motion-reduce:transition-none',
                    selected ? 'scale-75 opacity-0' : 'scale-100 opacity-100',
                )}
            >
                {idle}
            </span>
            <span
                className={cn(
                    'col-start-1 row-start-1 flex [--tevi-icon-tint:1]',
                    'drop-shadow-[0_2px_4px_color-mix(in_srgb,var(--text-brand)_45%,transparent)]',
                    'transition-[opacity,scale] duration-[380ms]',
                    NAV_SPRING,
                    selected ? 'scale-100 opacity-100' : 'scale-50 opacity-0',
                )}
            >
                {active}
            </span>
        </span>
    )
}

/**
 * Repaints a duotone glyph's detail layer White, as the DS bar does for `house-heart` and
 * `comment-dots` (`user-heart-alt` keeps every path on one colour). A `<use>` clone sits in a shadow
 * tree no selector reaches, so it goes through the sprite's custom property.
 */
export function Knockout({ children }: { children: ReactNode }) {
    return <span className="flex [--tevi-icon-detail:var(--white)]">{children}</span>
}
