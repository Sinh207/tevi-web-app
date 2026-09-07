'use client'

import { Menu as BaseMenu } from '@base-ui/react/menu'
import { cn } from '@shared/lib/utils'
import { buttonVariants } from '@shared/ui/button'

/**
 * The app's **action** menu — a kebab's list of things to do, as `/following` draws it.
 *
 * Rows 48 tall with 16 of horizontal padding, the label leading, a 1px rule between rows, and a
 * narrow panel. Two tones: an ordinary action and a destructive one.
 *
 * ```tsx
 * <ActionMenu>
 *   <ActionMenuTrigger aria-label={…}><Icon name="more-horizontal" size={20} className="size-5" /></ActionMenuTrigger>
 *   <ActionMenuContent>
 *     <ActionMenuItem onClick={…}>Mark as read</ActionMenuItem>
 *     <ActionMenuItem tone="destructive" onClick={…}>Delete</ActionMenuItem>
 *   </ActionMenuContent>
 * </ActionMenu>
 * ```
 *
 * ## Why this is not `shared/ui/menu.tsx`
 *
 * That file is the **DS port** — Figma `Dropdown/Menu Item` 107:23573, a 264px panel with a 48px
 * leading icon gutter — and its own note says the rows "should not drift". This is a different
 * object: legacy's `iconBtnMore`, which every kebab in the shipped product uses and which the DS has
 * not drawn. Keeping them apart is what lets the DS port stay a port. Hence `shared/components/`
 * rather than `shared/ui/`, the same split `filter-menu.tsx` sits on.
 *
 * ## Why it is in `shared/` at all
 *
 * The numbers were `features/channel/components/channel-menu.tsx`'s, and that file's own note says
 * they live there "until the real port happens" — with three call sites inside the feature. A
 * feature may not import another feature's internals, so when `features/notification` needed the
 * same kebab the choice was this or a **fourth** copy of the same six class strings.
 * `filter-menu.tsx` faced exactly that and answered it the same way, for the pick-one menu.
 *
 * `channel-menu.tsx` still holds its copy and its three consumers still read it: collapsing those
 * into this is a safe follow-up for whoever is next in that file, not something to do to a feature
 * from outside it. **When that happens, this is the surviving definition.**
 *
 * ## The trailing slot is the caller's, and it is what `justify-between` exists for
 *
 * A row is `justify-between gap-6`, so it lays out `[label, …trailing]` with no API of its own:
 * pass the glyph as a second child. `<Icon size={20} className="flex-none" />` is the shape every
 * caller should use, and `flex-none` stops a long label from squeezing the glyph.
 *
 * ⚠ **20, not 24.** A row's label is `type-dense-strong` — **14px** — and 24 next to it is a glyph
 * half again the height of the text it labels, which reads as the icon shouting over the word. The
 * number comes out of the DS rather than taste: `Dropdown/Menu Item` pairs a 24px glyph with a
 * `type-body-emphasis` label, i.e. **16px**, so the ratio is 1.5 and 14 × 1.5 = 21 → 20. It is also
 * what this app already ships at this size — `FilterMenu` at `variant="compact"` is the same skin
 * with the same 14px rows and puts its trailing `check-all` at 20.
 *
 * 24 is legacy's number, and legacy pairs it with 14px rows too, so the mismatch came in with the
 * skin. `features/channel`'s three copies still render 24 and have the same problem; they are a
 * one-character fix each for whoever is next in that file.
 *
 * Deliberately **not** an `icon` prop. The row is one flex line and the caller already owns what
 * goes on it; a prop would fix the trailing content to one glyph, and the pick-one menu
 * (`FilterMenu` at `variant="compact"`) puts a *tick* in the same place. Same slot, two meanings,
 * one layout.
 *
 * The glyph inherits the row's colour through `currentColor`, so a `destructive` row's icon turns
 * red with its label and no call site repeats the token.
 */

export const ActionMenu = BaseMenu.Root

/**
 * The kebab itself.
 *
 * ⚠ **Pass the glyph `className="size-5"` as well as `size={20}`.** `Icon` sets `width`/`height`
 * *attributes*, and `Button`'s size variant carries `[&_svg:not([class*='size-'])]:size-[18px]` — a
 * CSS rule, which beats a presentation attribute, so `size={20}` alone is silently overridden back
 * to 18. That `:not([class*='size-'])` guard is the opt-out the variant provides; this is what
 * taking it looks like. 20 rather than 18 because three dots are mostly whitespace and read smaller
 * than their box.
 *
 * `data-[popup-open]` paints the trigger while its menu is open — `--button-ghost-bg-hover` is a
 * step darker than the row's own hover, which is what keeps the kebab reading as its own target
 * inside an already-lit row.
 */
/**
 * The trigger for a caller that already owns the control's skin — pass the control as `render`.
 *
 * `ActionMenuTrigger` below bakes in `buttonVariants({ variant: 'ghost', iconOnly: true })`, which
 * is right for a kebab and wrong for anything with geometry of its own: the rail's accent `+` is a
 * DS `Navbar (Web)/Item`, 56×56 with a 1px inside stroke, and merging a button recipe onto it makes
 * the two sets of size and colour classes fight. This is the same primitive with no opinion:
 *
 * ```tsx
 * <ActionMenuAnchor render={<NavbarItem type="accent" aria-label={…}><Icon name="plus" /></NavbarItem>} />
 * ```
 *
 * base-ui still puts `aria-haspopup="menu"`, `aria-expanded` and `data-popup-open` on whatever it
 * renders, so the accessibility contract does not depend on which of the two you pick.
 */
export const ActionMenuAnchor = BaseMenu.Trigger

export function ActionMenuTrigger({ className, ...props }: BaseMenu.Trigger.Props) {
    return (
        <BaseMenu.Trigger
            data-slot="action-menu-trigger"
            className={cn(
                buttonVariants({ variant: 'ghost', size: 'medium', iconOnly: true }),
                'text-(--icon-secondary) hover:text-(--text-title)',
                'data-[popup-open]:bg-(--button-ghost-bg-hover) data-[popup-open]:text-(--text-title)',
                'disabled:pointer-events-none disabled:opacity-50',
                className,
            )}
            {...props}
        />
    )
}

/**
 * The panel. **200px**, the action menu's width — `FilterMenu`'s `compact` pick-one is 160, and
 * `channel-menu.tsx` records why those are two different numbers rather than one.
 *
 * `overflow-hidden` is load-bearing: rows are full-bleed and carry their own rule, so without it the
 * first and last square off the panel's rounded corners.
 *
 * Legacy also puts `backdropFilter: blur(16px)` behind `#FFFFFFE5` here. Not ported — `app-bar.css`
 * records that Figma applies **no backdrop blur anywhere** in this design system, and an opaque
 * elevated surface is what every other floating panel in the app uses.
 */
export function ActionMenuContent({
    className,
    children,
    align = 'end',
    side = 'bottom',
    sideOffset = 4,
    ...props
}: BaseMenu.Popup.Props & {
    align?: BaseMenu.Positioner.Props['align']
    side?: BaseMenu.Positioner.Props['side']
    sideOffset?: number
}) {
    return (
        <BaseMenu.Portal>
            {/* `align="end"` follows the writing direction on its own — base-ui reads `dir` — which
                is why the placement is expressed as start/end rather than left/right. */}
            <BaseMenu.Positioner
                side={side}
                align={align}
                sideOffset={sideOffset}
                className="z-50 outline-none"
            >
                <BaseMenu.Popup
                    data-slot="action-menu-content"
                    className={cn(
                        'min-w-[200px] max-w-[calc(100vw-2rem)]',
                        'overflow-hidden rounded-(--radius-lg) bg-(--background-elevated) shadow-lg outline-none',
                        'origin-(--transform-origin)',
                        'transition-[opacity,scale] duration-[160ms] ease-out',
                        'data-[starting-style]:scale-95 data-[starting-style]:opacity-0',
                        'data-[ending-style]:scale-95 data-[ending-style]:opacity-0',
                        className,
                    )}
                    {...props}
                >
                    {children}
                </BaseMenu.Popup>
            </BaseMenu.Positioner>
        </BaseMenu.Portal>
    )
}

export type ActionMenuItemTone = 'default' | 'destructive'

/**
 * One row: 48 tall, 16 horizontal, label leading and a 24px gap to whatever trails it.
 *
 * `not-last:border-b` rather than a rule per item, so a menu whose last entry is conditional — the
 * bar menu's "Mark all as read" is hidden for a guest — never ends on a dangling line.
 *
 * `type-dense-strong` (14/600) is legacy's weight for an action row, against the 500 its *filter*
 * rows use. `destructive` changes the colour and nothing else: the row is the same shape, it just
 * cannot be undone.
 */
export function ActionMenuItem({
    className,
    tone = 'default',
    ...props
}: BaseMenu.Item.Props & { tone?: ActionMenuItemTone }) {
    return (
        <BaseMenu.Item
            data-slot="action-menu-item"
            data-tone={tone}
            className={cn(
                'flex h-12 w-full cursor-pointer select-none items-center justify-between gap-6 px-4 text-start outline-none',
                'not-last:border-(--separator-default) not-last:border-b',
                'data-highlighted:bg-(--background-subtle)',
                'data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50',
                tone === 'destructive'
                    ? 'type-dense-strong text-(--text-error)'
                    : 'type-dense-strong text-(--text-title)',
                className,
            )}
            {...props}
        />
    )
}
