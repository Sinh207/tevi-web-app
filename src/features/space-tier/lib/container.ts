import { cn } from '@shared/lib/utils'

/**
 * `/space-tier`'s column — 612px from `md`, full width with a 16px inset below it. The same string
 * as `MONETIZATION_CONTAINER`, duplicated for the reason that one gives: a feature may not reach into
 * another's `lib/`, and a layout constant is not worth widening a barrel for.
 *
 * ## Page colour, not a painted plane
 *
 * `docs/DESIGN_SYSTEM.md` §6 asks *is any block a bare `--background-surface` card mid-column?* —
 * and here two are: the estimate card and the FAQ list, with the tier hero sitting straight on the
 * page between them. That is `/my-wallet`'s shape, and legacy's (`bgcolor: '#f4f4f5'` behind white
 * cards), so the screen keeps `--background` at every width. Only the walls (signed out, failed)
 * are single panels, and they take `SPACE_TIER_PANEL`.
 */
export const SPACE_TIER_CONTAINER = 'mx-auto w-full px-4 md:max-w-[612px] md:px-0'

/** A wall's box — full-bleed surface below `md`, a card from `md` up. */
export const SPACE_TIER_PANEL = '-mx-4 rounded-none bg-(--background-surface) md:mx-0 md:rounded-xl'

/**
 * The action bar — pinned to the bottom of the viewport at every width, as on the donation form:
 * the FAQ puts the button well below the fold on a phone, and the button is the reason the screen
 * exists. `sticky` rather than `fixed` so nothing above it is ever covered; an opaque ground and a
 * `border-t` because content scrolls under it; full-bleed below `md` with the button keeping the
 * column's inset.
 */
export const SPACE_TIER_FOOTER = cn(
    'sticky bottom-0 z-10 mt-auto flex flex-col pt-3 pb-4',
    '-mx-4 px-4 md:mx-0 md:px-0',
    'border-(--separator-default) border-t bg-(--background)',
)
