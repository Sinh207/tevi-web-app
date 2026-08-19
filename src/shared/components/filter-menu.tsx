'use client'

import { cn } from '@shared/lib/utils'
import { Icon } from '@shared/ui/icon'
import { Menu, MenuContent, MenuRadioGroup, MenuRadioItem, MenuTrigger } from '@shared/ui/menu'

/**
 * A pick-one filter — an icon button that opens a radio menu.
 *
 * Used by both ledger screens, which are separate features, so it lives here: props only, no domain, no
 * hooks. Each feature supplies its own option list, because their vocabularies genuinely differ (a
 * `payout` cannot happen in Star; a `top_up` cannot happen in USD).
 *
 * ## A radio group, not a list of buttons
 *
 * Only one filter is ever active, so `MenuRadioGroup` + `MenuRadioItem` is the shape that says so:
 * base-ui gives each row `role="menuitemradio"` with `aria-checked`, and arrow keys move between them. A
 * menu of plain items with a tick drawn on one of them looks identical and tells a screen reader nothing
 * about the choice being exclusive.
 *
 * ## The trigger is 24×24 and that is the comp's, not an oversight
 *
 * It sits inside a `ListHeaderAction` on a 48-tall header, so the header's own 12px padding is what
 * gives it a comfortable target — the pressable area is the padded row, not the glyph box. `aria-label`
 * because it is icon-only (`docs/DEFINITION_OF_DONE.md` §10).
 */

export interface FilterOption {
    /** The value written back on select. */
    key: string
    /** Already translated. */
    label: string
}

export function FilterMenu({
    options,
    value,
    onChange,
    triggerLabel,
    className,
}: {
    options: readonly FilterOption[]
    value: string
    onChange: (key: string) => void
    triggerLabel: string
    className?: string
}) {
    return (
        <Menu>
            <MenuTrigger
                aria-label={triggerLabel}
                className={cn(
                    'flex size-6 cursor-pointer items-center justify-center border-0 bg-transparent p-0',
                    'text-(--icon-default) outline-none',
                    'focus-visible:rounded-[4px] focus-visible:outline-2 focus-visible:outline-(--focus-ring)',
                    className,
                )}
            >
                <Icon name="filter" size={20} />
            </MenuTrigger>
            <MenuContent>
                <MenuRadioGroup
                    value={value}
                    onValueChange={next => {
                        if (typeof next === 'string') onChange(next)
                    }}
                >
                    {options.map(option => (
                        // `closeOnClick` so picking dismisses the menu, which is what a one-choice
                        // control should do. base-ui defaults radio items to staying open (for
                        // multi-step menus), so this is an explicit opt-in.
                        <MenuRadioItem key={option.key} value={option.key} closeOnClick>
                            {option.label}
                        </MenuRadioItem>
                    ))}
                </MenuRadioGroup>
            </MenuContent>
        </Menu>
    )
}
