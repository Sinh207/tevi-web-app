'use client'

import { Menu } from '@base-ui/react/menu'
import { useTranslation } from '@shared/i18n/use-translation'
import { cn } from '@shared/lib/utils'
import { Icon } from '@shared/ui/icon'
import { EVENT_STATES, type EventState } from '../api/events-api'
import { MENU_ITEM, MENU_ITEM_FILTER, MENU_POPUP, MENU_TRIGGER } from './channel-menu'

/**
 * The Live tab's state filter — legacy's `iconBtnFilter`.
 *
 * ## Why this is in the feature and not in `shared/ui`
 *
 * Because it is **not a DS port**, and `shared/ui` is for components that are. The DS does ship a
 * dropdown (`preview/dropdown.html`, Figma 107:24417, with `tevi-menu-item`,
 * `tevi-menu-section-title` and `tevi-menu-separator`) — my earlier claim that it was unavailable was
 * wrong, it sits *before* the point where `components.css` hits the 256 KiB read cap. What is still
 * missing is that stylesheet's numbers: item height, padding, gap, and the type ramp for label and
 * subtitle. Those are exactly the values `CLAUDE.md` says not to invent.
 *
 * So this is built to **legacy's** measurements, which are known, and lives here until the DS
 * component is ported properly. When it is, this file collapses into a call site.
 *
 * ## Behaviour comes from base-ui, geometry from legacy
 *
 * `Menu.RadioGroup` rather than plain items, because a filter is single-select: it emits
 * `role="menuitemradio"` with `aria-checked`, which is what makes the tick meaningful to a screen
 * reader rather than decoration. Focus trapping, roving arrow keys, Escape, outside-click and
 * collision-aware positioning all come from the primitive — the part that is genuinely hard and the
 * reason `docs/DEFINITION_OF_DONE.md` §10 forbids hand-rolling an overlay.
 *
 * Legacy's numbers, verbatim: `minWidth: 160`, rows `justify-content: space-between` at `gap: 24`,
 * `14/500` in `#1A1A1A`, and a `1px solid #E5E5E5` rule between items with none after the last. The
 * hexes map to `--text-title` and `--separator-default`, which is what lets the panel work in dark
 * mode where the literals could not.
 *
 * The tick is `check-double`, in the brand purple legacy uses — two overlapping marks, not one.
 *
 * ## A filter that is on has to look on, and legacy's does not
 *
 * Legacy paints this trigger `#1a1a1a` whatever is selected — there is no active state to port. So
 * the treatment is taken from the one place in this app that already solved it: `/my-wallet`'s
 * transaction-history bar filter, which fills the disc with `--brand` and flips the glyph to
 * `--text-on-accent`. Same problem, same answer, rather than a second visual language for "this
 * control is applied".
 *
 * Three things make it hold rather than *look* like it holds:
 *
 * - **`hover:not-disabled:`, not `hover:`** — that is the specificity `buttonVariants`' own ghost
 *   hover uses, and a plain `hover:` loses to it. The wallet filter carries the same note; without
 *   it the disc flashes back to unfiltered under the pointer, which reads as the filter clearing.
 * - **`data-[popup-open]:` too**, because `MENU_TRIGGER` repaints both fill and glyph while the
 *   panel is open. Left out, opening the menu of an applied filter makes it look unapplied.
 * - **The name says which filter is on** (`channel_live_filter_active`), because the fill is
 *   invisible to a screen reader and `sliders-simple` ships in one weight, so there is no filled
 *   glyph to swap to. The heading beside it already prints the state as text, so the *visible* UI
 *   never relied on colour alone; the accessible name is what closes the gap for the control.
 *
 * `data-filtered` publishes the state for a spec — `docs/TEST_IDS.md`: state goes in an attribute,
 * never in the id, and the accessible name here is one of nine translations.
 */
export function ChannelLiveFilter({
    value,
    onChange,
}: {
    value: EventState
    onChange: (value: EventState) => void
}) {
    const { t } = useTranslation()

    /** `''` is *All*, which is the absence of a filter rather than one of the choices. */
    const isFiltered = value !== ''

    return (
        <Menu.Root>
            {/*
             * Same trigger skin as the event kebab — see `MENU_TRIGGER`. These two sit in the same
             * tab, a heading apart, so letting only one of them recede would read as a bug rather
             * than a hierarchy. The applied fill is this control's alone: a kebab has no "on".
             */}
            <Menu.Trigger
                aria-label={
                    isFiltered
                        ? t('channel_live_filter_active', { value: t(EVENT_STATES[value]) })
                        : t('channel_live_filter')
                }
                data-filtered={isFiltered || undefined}
                className={cn(
                    MENU_TRIGGER,
                    isFiltered &&
                        'bg-(--brand) text-(--text-on-accent) hover:not-disabled:bg-(--brand) hover:text-(--text-on-accent) data-[popup-open]:bg-(--brand) data-[popup-open]:text-(--text-on-accent)',
                )}
            >
                <Icon name="sliders-simple" size={20} className="size-5" />
            </Menu.Trigger>
            <Menu.Portal>
                {/*
                 * `align="end"` so the panel's trailing edge meets the trigger's, which is where
                 * legacy anchors it (`transformOrigin` right/top against `anchorOrigin` right/
                 * bottom). The positioner handles the collision flip near a screen edge, which the
                 * MUI original does too — that is table stakes rather than a feature.
                 */}
                <Menu.Positioner side="bottom" align="end" sideOffset={8} className="z-50">
                    {/* Shell shared with the event menu — see `channel-menu.tsx`. */}
                    <Menu.Popup className={cn('min-w-[160px]', MENU_POPUP)}>
                        <Menu.RadioGroup
                            data-testid="channel-live-filter"
                            value={value}
                            onValueChange={next => onChange(next as EventState)}
                        >
                            {Object.entries(EVENT_STATES).map(([state, labelKey]) => (
                                <Menu.RadioItem
                                    data-testid="channel-live-filter-option"
                                    data-option-value={state}
                                    key={state}
                                    value={state}
                                    className={cn(MENU_ITEM, MENU_ITEM_FILTER)}
                                >
                                    {t(labelKey)}
                                    {/*
                                     * Only the selected row renders it — the indicator mounts on
                                     * `aria-checked`, so the tick and the state cannot disagree.
                                     */}
                                    <Menu.RadioItemIndicator className="flex flex-none">
                                        <Icon
                                            name="check-all"
                                            size={20}
                                            className="text-(--primary-600)"
                                        />
                                    </Menu.RadioItemIndicator>
                                </Menu.RadioItem>
                            ))}
                        </Menu.RadioGroup>
                    </Menu.Popup>
                </Menu.Positioner>
            </Menu.Portal>
        </Menu.Root>
    )
}
