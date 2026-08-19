'use client'

import { Menu as BaseMenu } from '@base-ui/react/menu'
import { cn } from '@shared/lib/utils'
import type { ComponentPropsWithoutRef, ReactNode } from 'react'
import { Icon } from './icon'

/**
 * Menu — Figma `Dropdown/Menu Item` 107:23573, `Dropdown/Section Title` 107:23571 and
 * `Dropdown/Separator` 107:24300, on base-ui's Menu.
 *
 * ## The popover shell is **not** in the design system, and that is documented upstream
 *
 * The DS ships the *rows* and nothing to put them in — its own handoff note says so in as
 * many words (`87e00715-…/handoff/README.md` §5: the filter menu's popover shell is one of
 * three things "chưa có trong design system … cần design review"). So `MenuContent` below
 * is composed from tokens — `--background-elevated`, `--shadow-xl`, `--radius-lg`, and the
 * `--spacing-2` block padding the mobile and desktop comps both draw — rather than ported.
 * If Figma ever draws it, this is the one part of this file to reconcile.
 *
 * The rows themselves are a real 1:1 port and should not drift.
 *
 * ## Why base-ui rather than a `<div>` and a click-outside handler
 *
 * Same reason `dialog.tsx` gives: focus trap, `Esc`, arrow-key roving focus, restoring
 * focus to the trigger on close, and `role="menuitemradio"` with the right ARIA wiring are
 * all things a hand-rolled popover gets wrong, and a filter nobody can reach with a
 * keyboard fails `docs/DEFINITION_OF_DONE.md` §10.
 *
 * ## The `Dropdown` *trigger* is deliberately absent
 *
 * Figma has two of them (`pill` 264×48 and `full` 402×48) and they are four-of-five
 * root properties apart, so they are a separate port. Nothing needs them yet: the callers
 * here trigger from an icon button in a `ListHeaderAction`.
 */

export const Menu = BaseMenu.Root
export const MenuTrigger = BaseMenu.Trigger
export const MenuRadioGroup = BaseMenu.RadioGroup

/**
 * The popup.
 *
 * **264px is Figma's own width** for every row in the set, and the comps keep it — so the
 * shell is sized to its content rather than the content stretched to a guessed shell.
 * `max-h` plus `overflow-y-auto` because the transaction filter has eleven rows and a
 * viewport can be shorter than 528px; the comps scroll it too, with the scrollbar hidden.
 *
 * `align="end"` and a top-right transform origin: the trigger sits at the right edge of a
 * section header, so the menu grows *from* it. In RTL `align="end"` follows the writing
 * direction on its own — base-ui reads `dir` — which is the whole reason the placement is
 * expressed as start/end rather than left/right.
 */
export function MenuContent({
    className,
    children,
    align = 'end',
    sideOffset = 8,
    ...props
}: BaseMenu.Popup.Props & {
    align?: BaseMenu.Positioner.Props['align']
    sideOffset?: number
}) {
    return (
        <BaseMenu.Portal>
            <BaseMenu.Positioner
                align={align}
                sideOffset={sideOffset}
                className="z-50 outline-none"
            >
                <BaseMenu.Popup
                    className={cn(
                        'flex w-[264px] max-w-[calc(100vw-2rem)] flex-col',
                        'max-h-[min(60vh,420px)] overflow-y-auto overscroll-contain',
                        'rounded-lg bg-(--background-elevated) py-2 shadow-[var(--shadow-xl)]',
                        'origin-(--transform-origin) outline-none',
                        'transition-[opacity,transform] duration-[160ms] ease-out',
                        'data-[starting-style]:scale-95 data-[starting-style]:opacity-0',
                        'data-[ending-style]:scale-95 data-[ending-style]:opacity-0',
                        // The comps hide the scrollbar; the rows are the affordance.
                        '[scrollbar-width:none] [&::-webkit-scrollbar]:h-0 [&::-webkit-scrollbar]:w-0',
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

/**
 * `Dropdown/Menu Item` — 264×48, an icon gutter exactly as wide as the row is tall (48),
 * then a label column padded 12/0.
 *
 * ## The hover is ours, and it is an addition rather than a port
 *
 * The DS's `Menu Item` declares `:focus-visible` and `:disabled` and **no hover at all**,
 * while its own component contract says hover is one of the four states every component
 * has. A menu row that does not respond to a pointer is not usable with a mouse, so this
 * adds `--button-ghost-bg-hover` — the token `LeftBarBalanceAction` already uses for the
 * same job, so the two read the same. Flagged here rather than silently: if the DS ships a
 * hover, take theirs.
 *
 * `data-[highlighted]` rather than `:hover` alone, so keyboard roving focus paints the same
 * row a pointer would. That is base-ui's attribute and it is the point of using it.
 */
const MENU_ITEM_BASE = cn(
    'flex h-[48px] w-full min-w-0 cursor-pointer items-center gap-0 border-0 bg-none px-2 text-start',
    'transition-colors duration-[120ms] ease-out',
    'data-[highlighted]:bg-(--button-ghost-bg-hover) hover:bg-(--button-ghost-bg-hover)',
    'outline-none focus-visible:-outline-offset-2 focus-visible:outline-2 focus-visible:outline-(--focus-ring)',
    'data-[disabled]:cursor-not-allowed',
)

export type MenuItemTone = 'default' | 'destructive'

export function MenuItem({
    className,
    tone = 'default',
    ...props
}: BaseMenu.Item.Props & { tone?: MenuItemTone }) {
    return (
        <BaseMenu.Item
            data-slot="menu-item"
            data-tone={tone}
            className={cn(MENU_ITEM_BASE, className)}
            {...props}
        />
    )
}

/**
 * The radio flavour, and the one the transaction filter uses.
 *
 * The tick is **inside** this component rather than passed in, because its behaviour is not
 * a caller's choice: the comps keep the 48px gutter reserved on every row and only change
 * the glyph's opacity, so the labels stay on one vertical line whether or not a row is the
 * selected one. Rendering the tick conditionally would shift ten labels left.
 *
 * `check-double` is the glyph the comps draw — a double tick, in Accents/Indigo.
 */
export function MenuRadioItem({
    className,
    children,
    /**
     * A quieter second line under the label — a currency's name under its code.
     *
     * A prop rather than letting the caller compose the label column itself: the column is what
     * keeps the row at 48 and its labels on the same baseline as every other row's, so a caller
     * passing its own would be re-deriving geometry this component owns. Two lines is all the DS
     * draws (`.tevi-menu-item__label` + `__subtitle`), so two is all this takes.
     */
    subtitle,
    tone = 'default',
    ...props
}: BaseMenu.RadioItem.Props & { tone?: MenuItemTone; subtitle?: ReactNode }) {
    return (
        <BaseMenu.RadioItem
            data-slot="menu-radio-item"
            data-tone={tone}
            className={cn(MENU_ITEM_BASE, className)}
            {...props}
        >
            <span className="flex min-w-0 flex-1 items-center">
                <MenuItemIcon className="text-(--accents-indigo-active)">
                    {/*
                     * `keepMounted` plus an opacity swap, not a conditional mount: the
                     * gutter has to stay occupied on unselected rows or the labels move.
                     * base-ui sets `data-[unchecked]` on the indicator either way.
                     */}
                    <BaseMenu.RadioItemIndicator
                        keepMounted
                        className="flex items-center justify-center data-[unchecked]:opacity-0"
                    >
                        <Icon name="check-double" size={20} />
                    </BaseMenu.RadioItemIndicator>
                </MenuItemIcon>
                <MenuItemLabels>
                    <MenuItemLabel tone={tone}>{children}</MenuItemLabel>
                    {subtitle !== undefined && subtitle !== null && subtitle !== '' && (
                        <MenuItemSubtitle>{subtitle}</MenuItemSubtitle>
                    )}
                </MenuItemLabels>
            </span>
        </BaseMenu.RadioItem>
    )
}

/** The 48×48 leading gutter. Always present, even when empty — see `MenuRadioItem`. */
export function MenuItemIcon({ className, ...props }: ComponentPropsWithoutRef<'span'>) {
    return (
        <span
            data-slot="menu-item-icon"
            className={cn(
                'flex size-[48px] flex-none items-center justify-center text-(--text-subtitle)',
                className,
            )}
            {...props}
        />
    )
}

/** The label column: 12/0 padding, gap 2, and it is what truncates. */
export function MenuItemLabels({ className, ...props }: ComponentPropsWithoutRef<'span'>) {
    return (
        <span
            data-slot="menu-item-labels"
            className={cn('flex min-w-0 flex-1 flex-col gap-[2px] py-3', className)}
            {...props}
        />
    )
}

export function MenuItemLabel({
    className,
    tone = 'default',
    ...props
}: ComponentPropsWithoutRef<'span'> & { tone?: MenuItemTone }) {
    return (
        <span
            data-slot="menu-item-label"
            className={cn(
                // 16/500 — `type-subheading-default` is 18, so this is the 16 medium pair.
                'type-body-emphasis block h-6 truncate',
                tone === 'destructive' ? 'text-(--accents-error-active)' : 'text-(--text-title)',
                className,
            )}
            {...props}
        />
    )
}

export function MenuItemSubtitle({ className, ...props }: ComponentPropsWithoutRef<'span'>) {
    return (
        <span
            data-slot="menu-item-subtitle"
            className={cn('type-dense-default block text-(--text-body)', className)}
            {...props}
        />
    )
}

/** `Dropdown/Section Title` — 33 tall, 14/500 Text - Body, padded 4/8/8. */
export function MenuSectionTitle({ className, ...props }: BaseMenu.GroupLabel.Props) {
    return (
        <BaseMenu.GroupLabel
            data-slot="menu-section-title"
            className={cn(
                'type-dense-emphasis flex h-[33px] w-full items-center gap-[10px] px-2 pt-1 pb-2',
                'text-(--text-body)',
                className,
            )}
            {...props}
        />
    )
}

/**
 * `Dropdown/Separator` — a 17-tall row whose whole job is to hold a 1px rule inset by 8.
 * The height is the spec: the rule is padded, not the rows around it.
 */
export function MenuSeparator({ className, ...props }: BaseMenu.Separator.Props) {
    return (
        <BaseMenu.Separator
            data-slot="menu-separator"
            className={cn('flex h-[17px] w-full items-center p-2', className)}
            {...props}
        >
            <span className="h-px w-full bg-(--separator-default)" />
        </BaseMenu.Separator>
    )
}

export const MenuGroup = BaseMenu.Group
