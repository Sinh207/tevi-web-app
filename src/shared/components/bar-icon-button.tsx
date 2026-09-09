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
 * which is what Figma draws for it. A **sub-page** bar is the other family: a 40px disc on
 * `--background-surface` with a 24px glyph, which is what `PageBackBar` arrived at.
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
 * `variant="ghost"` is the base only because it is the one that paints nothing of its own for the
 * `--background-surface` fill to sit on. The hover and press states are additions — Figma has no
 * interaction layer.
 *
 * ## The hairline is not decoration — without it the disc disappears on half the app's bars
 *
 * The fill is `--background-surface`, and a sub-page bar is **not always** page-coloured: every
 * screen following `docs/DESIGN_SYSTEM.md` §6's single-panel rule paints its bar with that same
 * surface below `md`. On those the disc was surface-on-surface — measured **1.00** — so the control
 * read as a bare chevron floating in the bar, on `/my-wallet/transaction-history`,
 * `/redeem-gift-code`, `/identification` and every other aligned screen. It only ever looked right on
 * the page-coloured half.
 *
 * This is §6a's rule applied to the one component it kept catching out: *a disc's ground is chosen
 * against the surface it lands on*, and here the surface is not knowable at the call site — the same
 * bar is page-coloured at one breakpoint and surface at the other. So the disc carries its own edge
 * instead of relying on a ground it cannot predict, and one hairline is right on both.
 *
 * **A border, not legacy's shadow.** Legacy solves the same problem with
 * `boxShadow: '0px 2px 10px rgba(0,0,0,0.1)'` — a soft dark halo, which is very nearly invisible on a
 * dark surface and would leave this broken in the theme legacy does not have.
 * The token is **`--button-secondary-border`** — what the DS already draws every `secondary` button's
 * edge with, so this disc's outline is the same hairline as every other bordered control rather than
 * a third opinion. It resolves to `--separator-strong` (`--zinc-300`), a ramp that flips with the
 * mode, so the edge is there at both ends. `--separator-default` was measurably too faint: **1.19**
 * against a dark surface bar.
 *
 * It is added **here** rather than on the screen that surfaced it, because a per-screen fix is
 * exactly the deviation §6b records being tried and reversed: two bars a scroll apart, visibly not
 * the same control, is the bug this component exists to prevent.
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
                'border border-(--button-secondary-border) bg-(--background-surface)',
                'hover:not-disabled:bg-(--background-segment)',
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
