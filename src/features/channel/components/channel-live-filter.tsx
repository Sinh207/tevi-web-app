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
 */
export function ChannelLiveFilter({
    value,
    onChange,
}: {
    value: EventState
    onChange: (value: EventState) => void
}) {
    const { t } = useTranslation()

    return (
        <Menu.Root>
            {/*
             * Same trigger skin as the event kebab — see `MENU_TRIGGER`. These two sit in the same
             * tab, a heading apart, so letting only one of them recede would read as a bug rather
             * than a hierarchy.
             */}
            <Menu.Trigger aria-label={t('channel_live_filter')} className={MENU_TRIGGER}>
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
                            value={value}
                            onValueChange={next => onChange(next as EventState)}
                        >
                            {Object.entries(EVENT_STATES).map(([state, labelKey]) => (
                                <Menu.RadioItem
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
