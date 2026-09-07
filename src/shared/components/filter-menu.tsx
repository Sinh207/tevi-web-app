'use client'

import { Menu as BaseMenu } from '@base-ui/react/menu'
import { subTestId } from '@shared/lib/test-id'
import { cn } from '@shared/lib/utils'
import { Icon } from '@shared/ui/icon'
import type { TeviIconName } from '@shared/ui/icon-names'
import { MenuContent, MenuRadioItem } from '@shared/ui/menu'
import type { ReactElement } from 'react'

/**
 * A pick-one filter — an icon button that opens a radio menu.
 *
 * Used by both ledger screens and `/my-membership`, which are three separate features, so it lives
 * here: props only, no domain, no hooks. Each feature supplies its own option list, because their
 * vocabularies genuinely differ (a `payout` cannot happen in Star; a `top_up` cannot happen in USD).
 *
 * ## A radio group, not a list of buttons
 *
 * Only one filter is ever active, so a radio group is the shape that says so: base-ui gives each row
 * `role="menuitemradio"` with `aria-checked`, and arrow keys move between them. A menu of plain items
 * with a tick drawn on one of them looks identical and tells a screen reader nothing about the choice
 * being exclusive.
 *
 * ## Two skins, and the second one is not a DS port
 *
 * | `variant` | rows | the tick | where it comes from |
 * |---|---|---|---|
 * | `ds` (default) | the DS `Dropdown/Menu Item`, 48 tall with a 48px leading gutter | leading, `check-double`, Accents/Indigo | Figma 107:23573, ported in `shared/ui/menu.tsx` |
 * | `compact` | 48 tall, label leading and mark trailing at a 24 gap, a rule between rows | trailing, `check-all`, `--primary-600` | **legacy's** `iconBtnFilter`, whose numbers are known |
 *
 * The DS skin is the port and stays the default because it is what Figma actually draws. **No screen
 * is on it today**: the product asked for legacy's filter — the one on the channel Live tab — on
 * `/my-membership` first and then on both ledger screens, and that panel is genuinely a different
 * object: 160 wide rather than 264, no icon gutter, and a separator between every row. `ds` is kept
 * rather than deleted because it is the ported truth of Figma 107:23573; deleting it would mean
 * re-porting it from the stylesheet the next time a screen wants what the DS draws.
 *
 * `features/channel/components/channel-menu.tsx` holds a third copy of these same legacy numbers, for
 * its Live-tab filter and its event kebab. It got there first and its own doc says it lives in the
 * feature "until the real port happens" — but a feature may not import another feature's internals,
 * so a fourth copy inside `features/membership` was the alternative to this. Its filter can
 * collapse into this call whenever somebody is in that file; the event *action* menu cannot (plain
 * items, heavier type, a destructive row), and that is the part that should stay there.
 *
 * ⚠ When the DS dropdown is ported for real — its geometry is in `components.css`, which is readable
 * — `compact` is the skin to reconcile, not `ds`.
 *
 * ## The default trigger is a 32px disc around a 20px glyph
 *
 * `DEFAULT_TRIGGER` below carries the geometry and why 32 rather than the 40 the rest of this app's
 * icon discs use. `aria-label` because it is icon-only (`docs/DEFINITION_OF_DONE.md` §10).
 *
 * ## `active` — a filter that is on has to look on
 *
 * Nothing else on a list header says a filter is applied, so without this the only signal is the list
 * being shorter than expected. The two screens on `BarIconButton` (`/my-wallet/transaction-history`,
 * `/my-membership`) already fill their disc for exactly this reason; the default trigger fills its own
 * with the same solid brand purple, `--brand`, in both modes — see `TRIGGER_ON` for the hex and for
 * the Dark contrast that was traded away to keep it.
 *
 * The fill is not the whole signal, because a colour is invisible to a screen reader and
 * `sliders-simple` ships in one weight, so there is no filled *glyph* to swap to either.
 * `triggerLabel` is the caller's, so the **name** carries it: both ledgers and `/my-membership` pass
 * "Filter transactions — Exchange" while a filter is on and "Filter" while none is.
 *
 * It is a **prop, not `value !== ''`**: "unfiltered" is each list's own fact. Both ledgers spell it
 * `''`, `/my-membership` spells it `all`, and a sort menu (`/following`) has no unfiltered state at
 * all — one of its two orderings is always on.
 *
 * ## `trigger`, for the same menu on a different control
 *
 * A page bar wants the 40px disc `BarIconButton` owns, not a bare 24px glyph — and reproducing that
 * disc from a class string is exactly the drift that component's own note was written about (two bars
 * a scroll apart, visibly not the same control). So the caller can hand in the element and base-ui's
 * `render` merges the menu's own props — `onClick`, `aria-haspopup`, `aria-expanded`, the ref — onto
 * it. The **menu** is what is shared here; which button opens it is the page's business.
 *
 * `aria-label` still comes from `triggerLabel` for the default trigger. A supplied element brings its
 * own name (`BarIconButton` requires one), so nothing is applied over it.
 */

export type FilterMenuVariant = 'ds' | 'compact'

export interface FilterOption {
    /** The value written back on select. */
    key: string
    /** Already translated. */
    label: string
}

/**
 * The default trigger: a 32px disc holding the 20px glyph.
 *
 * **32 and not 40**, which is what every other icon disc in this app is (`BarIconButton`,
 * `DialogCloseButton`). Those two live in bars and dialog bands that are 56–60 tall; this one lives in
 * a `ListHeader`, whose 48px row is `px-4 py-3` over a 24px line — a 40px disc would push the header
 * to 64 and take the panel's sticky offset with it. `-my-1` is what keeps 32 inside that 24px line, so
 * the row stays 48 and the disc still clears WCAG 2.5.8's 24×24 by a comfortable margin. It used to be
 * a bare `size-6` glyph with no disc at all, on the theory that the header's own padding was the
 * target — it is not: that padding belongs to the header `div`, and pressing it did nothing.
 *
 * The disc's trailing edge meets the header's 16px padding column, the way `BarIconButton`'s meets a
 * bar's. That puts the *glyph* 6px inside the column, which is correct once there is a disc — the disc
 * is the object being aligned.
 */
const DEFAULT_TRIGGER = cn(
    '-my-1 flex size-8 flex-none cursor-pointer items-center justify-center rounded-full',
    'border-0 p-0 outline-none transition-colors',
    'focus-visible:outline-2 focus-visible:outline-(--focus-ring)',
)

/**
 * On: the solid brand disc with a white glyph — **`--brand` in both modes**, which is `#501bc0`, which
 * is the hex legacy's own filter mark is drawn in. The same fill
 * `/my-wallet/transaction-history` and `/my-membership` put on their bar trigger, so the one control
 * is the one colour on all three screens.
 *
 * The tinted pair (`--background-brand` / `--text-on-brand`, what the ledger rows below lead with) was
 * the first version and was overruled: this is a *control*, and a row's leading circle is a *label*.
 * Wearing the label's colours made the filter read as one more row rather than as the thing that
 * shortened the list.
 *
 * ## Dark keeps the same hex, and that is a decision with a number against it
 *
 * `--brand` is `--primary-500` in **both** modes — the one rung of the ramp that does not invert (see
 * its note in `globals.css`). Measured against the panel it sits on:
 *
 * | | disc ↔ panel | glyph ↔ disc |
 * |---|---|---|
 * | Light — `#501bc0` on `#ffffff` | 9.30 | 9.30 |
 * | Dark — `#501bc0` on `#18181b` | **1.91** | 9.30 |
 * | Dark — `#8a4fe3` (`--primary-600`) on `#18181b` | 3.63 | 4.87 |
 *
 * This shipped for a turn as `dark:bg-(--primary-600)` on the strength of that middle row: at 1.91 the
 * disc is close to dissolving into the panel, and in Dark the off-state glyph is *already* near-white,
 * so "filled" and "not filled" differ by less than they do in Light. **The product chose the exact
 * brand hex over the contrast**, and the call is defensible on its own terms — one identity colour
 * beats three screens agreeing on a number, and the white glyph inside the disc is 9.30 either way, so
 * the *control* is never hard to read; it is the disc's edge against the panel that is soft.
 *
 * Do not reintroduce a `dark:` override here in isolation. If the Dark ratio is to be fixed it belongs
 * on the token — the two bar call sites paint the same `--brand` disc and would otherwise disagree with
 * this one — and `--background-brand`'s note in `globals.css` is the worked example of doing it there.
 *
 * `hover:` restates the fill so the off-state's hover cannot win on pointer-over and flash the trigger
 * back to looking unfiltered — the same specificity note those two call sites carry.
 */
const TRIGGER_ON = cn('bg-(--brand) text-(--text-on-accent) hover:bg-(--brand)')

/** Off: no ground until a pointer is on it, so the resting header is unchanged. */
const TRIGGER_OFF = cn('bg-transparent text-(--icon-default)', 'hover:bg-(--background-segment)')

/**
 * The compact panel.
 *
 * `overflow-hidden` is load-bearing — rows are full-bleed and carry their own rule, so without it the
 * first and last square off the panel's rounded corners.
 *
 * Legacy also puts `backdropFilter: blur(16px)` behind `#FFFFFFE5` here. Not ported: `app-bar.css`
 * records that Figma applies **no backdrop blur anywhere** in this design system, and an opaque
 * elevated surface is what every other floating panel in this app uses.
 */
const COMPACT_POPUP = cn(
    'min-w-[160px] overflow-hidden outline-none',
    'rounded-(--radius-lg) bg-(--background-elevated) shadow-lg',
    // The same enter/exit the DS panel gets. Legacy has none — it is MUI's default fade — and a
    // popup that snaps open next to one that eases would read as two different controls.
    'origin-(--transform-origin) transition-[opacity,transform] duration-[160ms] ease-out',
    'data-[starting-style]:scale-95 data-[starting-style]:opacity-0',
    'data-[ending-style]:scale-95 data-[ending-style]:opacity-0',
)

/**
 * One compact row: 48 tall, 16 horizontal, label leading and mark trailing at a 24px gap.
 *
 * `not-last:border-b` rather than a rule per item, so a list whose last entry is conditional never
 * ends on a dangling line. Legacy's `#E5E5E5` is `--separator-default` and its `#1A1A1A` is
 * `--text-title` — the literals cannot survive dark mode, which is the whole reason the tokens exist.
 */
const COMPACT_ITEM = cn(
    'type-dense-emphasis flex h-12 w-full cursor-pointer items-center justify-between gap-6 px-4',
    'text-start text-(--text-title) select-none outline-none',
    'not-last:border-(--separator-default) not-last:border-b',
    'data-highlighted:bg-(--background-subtle)',
)

export function FilterMenu({
    options,
    value,
    onChange,
    triggerLabel,
    trigger,
    icon = 'filter',
    active = false,
    variant = 'ds',
    className,
    testId,
}: {
    options: readonly FilterOption[]
    value: string
    onChange: (key: string) => void
    /** Accessible name for the default trigger. Ignored when `trigger` is given — see the note. */
    triggerLabel: string
    /** Open the menu from this element instead of the default 24px glyph. */
    trigger?: ReactElement
    /** The default trigger's glyph. Ignored when `trigger` is given. */
    icon?: TeviIconName
    /**
     * A filter other than "everything" is on — the default trigger takes its brand-tinted disc. See
     * the note above for why the caller states it rather than this component deriving it, and
     * `TRIGGER_ON` for the treatment. A supplied `trigger` styles itself and ignores this.
     */
    active?: boolean
    variant?: FilterMenuVariant
    className?: string
    /**
     * Base `data-testid`. The default trigger takes the bare id; each option is `${testId}-option`
     * carrying `data-option-key={option.key}`.
     *
     * **A caller-supplied `trigger` keeps its own testid** — `BaseMenu.Trigger render={trigger}`
     * hands the element straight through, and overwriting the caller's id would be this component
     * renaming somebody else's element. The rule throughout: whoever renders an element owns its id.
     *
     * The popup portals to `document.body`, so an option is **not** a DOM descendant of the trigger.
     */
    testId?: string
}) {
    const select = (next: unknown) => {
        if (typeof next === 'string') onChange(next)
    }

    return (
        <BaseMenu.Root>
            {trigger ? (
                <BaseMenu.Trigger render={trigger} />
            ) : (
                <BaseMenu.Trigger
                    aria-label={triggerLabel}
                    data-testid={testId}
                    className={cn(DEFAULT_TRIGGER, active ? TRIGGER_ON : TRIGGER_OFF, className)}
                >
                    <Icon name={icon} size={20} />
                </BaseMenu.Trigger>
            )}

            {variant === 'compact' ? (
                <BaseMenu.Portal>
                    {/*
                     * `align="end"` so the panel's trailing edge meets the trigger's, which is where
                     * legacy anchors it (`transformOrigin` right/top against `anchorOrigin`
                     * right/bottom). The positioner handles the collision flip near a screen edge.
                     * Expressed as start/end rather than left/right so RTL follows the writing
                     * direction on its own — base-ui reads `dir`.
                     */}
                    <BaseMenu.Positioner
                        side="bottom"
                        align="end"
                        sideOffset={8}
                        className="z-50 outline-none"
                    >
                        <BaseMenu.Popup className={COMPACT_POPUP}>
                            <BaseMenu.RadioGroup
                                data-testid={subTestId(testId, 'group')}
                                value={value}
                                onValueChange={select}
                            >
                                {options.map(option => (
                                    // `closeOnClick` so picking dismisses the menu, which is what a
                                    // one-choice control should do — and what legacy's MUI menu does
                                    // (`onClick={handleClose}` on the `Menu` itself). base-ui defaults
                                    // radio items to staying open, for multi-step menus.
                                    <BaseMenu.RadioItem
                                        key={option.key}
                                        data-testid={subTestId(testId, 'option')}
                                        data-option-key={option.key}
                                        value={option.key}
                                        closeOnClick
                                        className={COMPACT_ITEM}
                                    >
                                        {option.label}
                                        {/*
                                         * Only the selected row renders it — the indicator mounts on
                                         * `aria-checked`, so the tick and the state cannot disagree.
                                         * There is no leading gutter to keep occupied here, which is
                                         * why this skin can mount it conditionally and the DS one
                                         * cannot (see `MenuRadioItem`).
                                         *
                                         * `check-all`, not `check-double`: two overlapping marks, the
                                         * glyph legacy draws, in the brand purple it draws it in.
                                         */}
                                        <BaseMenu.RadioItemIndicator className="flex flex-none">
                                            <Icon
                                                name="check-all"
                                                size={20}
                                                className="text-(--primary-600)"
                                            />
                                        </BaseMenu.RadioItemIndicator>
                                    </BaseMenu.RadioItem>
                                ))}
                            </BaseMenu.RadioGroup>
                        </BaseMenu.Popup>
                    </BaseMenu.Positioner>
                </BaseMenu.Portal>
            ) : (
                <MenuContent>
                    <BaseMenu.RadioGroup
                        data-testid={subTestId(testId, 'group')}
                        value={value}
                        onValueChange={select}
                    >
                        {options.map(option => (
                            <MenuRadioItem
                                key={option.key}
                                data-testid={subTestId(testId, 'option')}
                                data-option-key={option.key}
                                value={option.key}
                                closeOnClick
                            >
                                {option.label}
                            </MenuRadioItem>
                        ))}
                    </BaseMenu.RadioGroup>
                </MenuContent>
            )}
        </BaseMenu.Root>
    )
}
