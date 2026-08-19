'use client'

import { cn } from '@shared/lib/utils'
import { buttonVariants } from '@shared/ui/button'

/**
 * The popup shell both of this feature's menus wear.
 *
 * ## Why the classes live here instead of in each menu
 *
 * There are two — the Live tab's state filter and an event row's actions — and they were written a
 * day apart from the same legacy screen. That is exactly the shape of the drift this feature has
 * already been bitten by twice (a globe glyph that ended up different in three places, a copy row
 * duplicated between the header and the About tab). The *behaviour* differs — one is a radio group,
 * the other plain items — so this shares the skin and nothing else.
 *
 * ## Not `shared/ui`, and not the DS component
 *
 * The DS ships a dropdown (`preview/dropdown.html`, Figma 107:24417) and it is readable — my earlier
 * claim that it was cut off by the 256 KiB cap was wrong, it sits before `sheet`. What is not
 * readable without pulling the whole 251 KiB stylesheet is its **geometry**, so these are legacy's
 * numbers, which are known, and this stays in the feature until the real port happens.
 *
 * Legacy's two menus disagree with each other and the difference is meaningful, so both are kept:
 * the filter is `minWidth: 160` with `14/500` rows, the event menu is `minWidth: 200` with `14/600`
 * — a filter offers values, an action menu offers verbs, and the heavier weight is the verb.
 *
 * `#E5E5E5` / `#DCDCDC` (legacy uses both, one per menu) collapse to `--separator-default`; `#141414`
 * and `#1A1A1A` to `--text-title`; `#E41F37` to `--text-error`. The literals cannot survive dark
 * mode, which is the whole reason the tokens exist.
 */

/**
 * The trigger both menus hang off — an icon-only ghost button.
 *
 * ## It was hand-rolled, and the DS already had it
 *
 * Both triggers were written as a bespoke `size-9` box with a hand-picked radius and hover fill.
 * `Button` at `ghost` + `iconOnly` + `medium` is **exactly the same 36×36**, and it brings the parts
 * that were guessed: radius 12 (the hand-rolled one used `--radius-md`, 8), the DS's own
 * `--button-ghost-bg-hover`, a 120ms colour transition, and the focus ring. So this composes
 * `buttonVariants` rather than restating it — the geometry is the design system's, not this file's.
 *
 * ## Two things the hand-rolled version got wrong, both measured
 *
 * **The glyph was `--text-title`** — 18.1:1 on the page, the *identical* token the event title beside
 * it uses. A kebab is a secondary control and it was painted at the same weight as the thing it is
 * secondary to. `--icon-secondary` is the DS's role for exactly this, and it is not timid about it:
 * 4.4:1 in light and 8.19:1 in dark, well past the 3:1 WCAG 1.4.11 asks of a non-text control. It
 * darkens to `--text-title` on hover and while the popup is open, so the control still resolves under
 * the pointer rather than merely lighting up behind it.
 *
 * **The hover fill was invisible.** The trigger painted `--background-subtle` on hover — and the
 * event row underneath paints `--background-subtle` on hover too, the same token. Reaching for the
 * kebab hovered the row first, so by the time the pointer landed the fill it was about to paint was
 * already there and nothing happened. `--button-ghost-bg-hover` is a step darker (`--zinc-200` against
 * `--zinc-100`), which is what makes the kebab read as its own target inside an already-lit row.
 */
export const MENU_TRIGGER = cn(
    buttonVariants({ variant: 'ghost', size: 'medium', iconOnly: true }),
    'text-(--icon-secondary) hover:text-(--text-title)',
    'data-[popup-open]:bg-(--button-ghost-bg-hover) data-[popup-open]:text-(--text-title)',
)

/**
 * ⚠ Pass the glyph `className="size-5"` as well as `size={20}`.
 *
 * `Icon` sets `width`/`height` **attributes**, and `Button`'s size variant carries
 * `[&_svg:not([class*='size-'])]:size-[18px]` — a CSS rule, which beats a presentation attribute. So
 * `size={20}` alone is silently overridden back to the DS's 18. That `:not([class*='size-'])` guard
 * is the opt-out the variant was written to provide; this is what taking it looks like.
 *
 * 20 rather than 18 because `more-vertical` is three dots. A glyph that is mostly whitespace reads
 * smaller than its box, and at 18 it goes faint — the one place these triggers step off the DS number,
 * and only after rendering both against the real sprite.
 */

/**
 * The panel. `overflow-hidden` is load-bearing — rows are full-bleed and carry their own rule, so
 * without it the first and last square off the panel's rounded corners.
 *
 * Legacy also puts `backdropFilter: blur(16px)` behind `#FFFFFFE5` here. Not ported: `app-bar.css`
 * records that Figma applies **no backdrop blur anywhere** in this design system, and an opaque
 * elevated surface is what the DS uses for every other floating panel in the app.
 */
export const MENU_POPUP =
    'overflow-hidden rounded-(--radius-lg) bg-(--background-elevated) shadow-lg outline-none'

/**
 * One row: 48 tall, 16 horizontal, label leading and mark trailing at a 24px gap.
 *
 * `not-last:border-b` rather than a rule per item, so a menu whose last entry is conditional — the
 * event menu drops Cancel unless the event is published — never ends on a dangling line.
 */
export const MENU_ITEM =
    'flex h-12 w-full cursor-pointer select-none items-center justify-between gap-6 px-4 text-start outline-none not-last:border-(--separator-default) not-last:border-b data-highlighted:bg-(--background-subtle)'

/** Legacy's `fontWeight: 500` filter rows against `600` for action rows. */
export const MENU_ITEM_FILTER = 'type-dense-emphasis text-(--text-title)'
export const MENU_ITEM_ACTION = 'type-dense-strong text-(--text-title)'

/** The one destructive row in the feature: "Cancel" on a published event. */
export const MENU_ITEM_DESTRUCTIVE = 'type-dense-strong text-(--text-error)'
