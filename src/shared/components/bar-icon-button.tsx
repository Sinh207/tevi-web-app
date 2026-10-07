'use client'

import { cn } from '@shared/lib/utils'
import { Button } from '@shared/ui/button'
import { Icon, type IconGlyphProps } from '@shared/ui/icon'

/**
 * The circular icon button a **sub-page bar** uses — back, share, and whatever lands next to them.
 *
 * ## Why it is shared rather than written per bar
 *
 * There are two bar families in this app and they are not interchangeable. `AppTopBar` — the mobile
 * home bar inside `(tabs)` — uses the DS `App Bar`'s own buttons at 44 with unfilled 22px glyphs,
 * which is what Figma draws for it. A **sub-page** bar is the other family: a 40px ghost target
 * with a 24px glyph, which is what `PageBackBar` arrived at.
 *
 * That second treatment used to exist in exactly one file, so the channel page's own bar reproduced
 * it from memory and got four things different at once: `AppBarButton` instead of `Button`, 44
 * instead of 40, a glyph at 22 instead of 24, and `scale-[0.97]` instead of
 * `[0.95]`. Two bars a scroll apart, visibly not the same control. Extracting it is the fix that
 * cannot drift again.
 *
 * `weight` is explicit at every call site rather than defaulted — see the note on the props below.
 *
 * ## Two measured traps, both inherited from `PageBackBar`
 *
 * 1. **`size-6` on the glyph is load-bearing.** `Button` styles its icons with
 *    `[&_svg:not([class*='size-'])]:size-5`, so an icon *without* a `size-` class of its own loses to
 *    that CSS and renders at 20 whatever `size` says — `size={24}` alone measurably did nothing. The
 *    component owns the glyph for this reason: it is not a mistake a caller should be able to make.
 * 2. **`weight="filled"` needs the sprite rebuilt.** A new name+weight pair is not in the subset until
 *    `pnpm icons` runs, and until then the glyph is an empty box.
 *
 * `variant="ghost"` is the base because the control paints nothing at rest (see below). The hover
 * disc and the press scale are additions — Figma has no interaction layer.
 *
 * ## Ghost on the bar — no disc, no edge — because the bar is already the ground
 *
 * This was a 40px disc filled `--background-surface` with a `--button-secondary-border` hairline, and
 * the hairline existed only to rescue the disc: on every screen following `docs/DESIGN_SYSTEM.md` §6's
 * single-panel rule the bar *is* `--background-surface` below `md`, so the disc measured **1.00**
 * against it and read as a bare chevron. The edge fixed the visibility and kept the cost — three
 * outlined circles flanking a centred title, the heaviest thing in a bar whose only job is to get out
 * of the way.
 *
 * Every sub-page bar here is **opaque** (`ChannelTopBar`'s note says why the immersive cover bar was
 * not ported), so the control never needs a ground of its own: the glyph against the bar is what
 * identifies it, and `--text-title` clears 17:1 against both grounds in both themes, so it does not
 * matter which of the two the bar is wearing at this breakpoint. The disc now appears only as a **state** — hover and
 * press paint `--background-segment` — which is the shape native navigation bars use.
 * Compared side by side, both themes × both grounds, at `/dev/bar-icon-button`.
 *
 * **Deliberate divergence from legacy**, which draws a white disc with a
 * `0px 2px 10px rgba(0,0,0,0.1)` halo — a treatment that is nearly invisible on a dark surface, in the
 * theme legacy does not have.
 *
 * **The one ground that does need a disc is artwork**, and it is the caller's to supply because only
 * the caller knows when it is on it: `/premium` and `/gift-premium` pass `PREMIUM_CONTROL_ON_HERO`
 * (frosted glass) while their bar sits on the brand band. That class sets fill, edge and ink, and the
 * edge lands on `Button`'s own `border border-transparent`, so the box does not change size between
 * the two states.
 *
 * Fix the treatment **here**, never on the screen that surfaced a problem: two bars a scroll apart
 * that are visibly not the same control is the bug this component exists to prevent (§6b records a
 * per-screen fix being tried and reversed).
 *
 * The loading half is `BarIconButtonSkeleton`, next to this file — a 40px grey disc stood in for the
 * old control, and standing in for a bare glyph it would be a shape the page never shows.
 *
 * The 40px box is a deliberate 4 under Apple's HIG and Material's 44, and well over WCAG 2.5.8's
 * 24×24 minimum; the bar's own 16 padding keeps it clear of the screen edge either way.
 *
 * ## Typing
 *
 * `name` and `weight` are forwarded as `IconGlyphProps`, not as two independent props — that union is
 * what makes a weight a glyph does not have into a compile error. `name` is omitted from the button's
 * own props because `<button name>` is a form attribute and would collide.
 *
 * No default weight, deliberately, and the two live call sites disagree — `angle-left` is filled,
 * `share` is not. That is the reason the prop exists: defaulting to `filled` would mean accepting a
 * name from the *base* set and then rendering a weight it may not have (an empty box at runtime
 * instead of a red squiggle), and it would also quietly decide a question that belongs to whoever is
 * looking at the bar. `icons.md` in the DS marks which glyphs have only one weight; for the rest,
 * pick.
 */
export type BarIconButtonProps = Omit<
    React.ComponentPropsWithoutRef<'button'>,
    'children' | 'aria-label' | 'name'
> &
    IconGlyphProps & {
        /** Required: an icon-only control with no accessible name is an unlabelled button. */
        label: string
        /**
         * Flip the glyph under `dir="rtl"`. On for directional art (`angle-left`), off for anything
         * symmetric (`share`, `more-horizontal`) — mirroring those would just look wrong in Arabic.
         */
        mirrored?: boolean
    }

export function BarIconButton({
    name,
    weight,
    label,
    mirrored = false,
    className,
    ...props
}: BarIconButtonProps) {
    return (
        <Button
            variant="ghost"
            size="large"
            iconOnly
            aria-label={label}
            className={cn(
                'size-10 rounded-full active:scale-[0.95]',
                'bg-transparent hover:not-disabled:bg-(--background-segment)',
                className,
            )}
            {...props}
        >
            {/* `name`/`weight` forwarded as the pair they were typed as. */}
            <Icon
                {...({ name, weight } as IconGlyphProps)}
                size={24}
                className={cn('size-6', mirrored && 'rtl:-scale-x-100')}
            />
        </Button>
    )
}
