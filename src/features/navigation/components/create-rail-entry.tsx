'use client'

import {
    ActionMenu,
    ActionMenuAnchor,
    ActionMenuContent,
    ActionMenuItem,
} from '@shared/components/action-menu'
import { GetAppDialog } from '@shared/components/get-app-dialog'
import { useTranslation } from '@shared/i18n/use-translation'
import { RISE, riseDelay } from '@shared/lib/motion'
import { cn } from '@shared/lib/utils'
import { Icon } from '@shared/ui/icon'
import { NavbarItem } from '@shared/ui/navbar'
import { useCreateAction } from '../hooks/use-create-action'
import { CreateOptionRow } from './create-option-row'

/**
 * The rail's accent `+`, the menu it opens, and the app prompt one of its rows raises.
 *
 * ## The whole entry lives here rather than in `AppNavbar`
 *
 * A `NavbarItem` that is also a menu trigger is three coupled things — the control, the popover and
 * the dialog behind one of its rows — and `AppNavbar` is a list of nine entries. Only the button is
 * DOM: `ActionMenuContent` portals, and `Dialog` is base-ui's `Root`, which renders no element at
 * all while closed. So as a child of `NavbarGroup` this contributes exactly one flex item and the
 * group's gap is unaffected.
 *
 * ## `ActionMenu`, not the DS `Menu`
 *
 * `shared/ui/menu.tsx` is the 1:1 port of `Dropdown/Menu Item` (107:23573) and its own note says
 * those rows "should not drift"; it also forwards no `side` to base-ui's positioner, so it cannot
 * be told to open *beside* the rail. `ActionMenu` is the app's own action list — 200px, 48px rows,
 * a rule between them, `side`/`align` already exposed, and a caller-owned row body, which is what
 * lets a leading glyph and a dimmed unavailable row be composed rather than added as props to a
 * port. Legacy's create menu is a popover in this position too.
 *
 * `side="inline-end"` and `align="center"`: the menu grows out of the rail towards the page, level
 * with the button. Both are logical, so RTL — where the rail is on the right — mirrors on its own;
 * base-ui reads `dir`.
 *
 * ## The rows are `List/Action`, and the panel is sized to them
 *
 * Their whole inside is `CreateOptionRow` — the same 48px leading slot, 32px tile and two-line
 * text the phone's dialog draws, so the Create list is one component at both widths. `ActionMenu`'s
 * own row geometry (`h-12`, `px-4`, `justify-between`) is what has to give way: `h-auto` for two
 * lines, `gap-0` because the row's own parts already space themselves, and a panel wide enough for
 * a tile, two lines of text and a badge rather than the 200px a kebab's labels need.
 */
export function CreateRailEntry() {
    const { t } = useTranslation()
    const create = useCreateAction()

    return (
        <>
            <ActionMenu open={create.open} onOpenChange={create.onOpenChange}>
                {/*
                 * The DS item *is* the trigger. `ActionMenuAnchor` is the unstyled half of the
                 * primitive — `ActionMenuTrigger`'s ghost-button recipe would fight this item's
                 * 56×56 geometry and its accent ground. base-ui still stamps `aria-haspopup="menu"`
                 * and `aria-expanded` onto whatever it renders, so the menu semantics are the
                 * primitive's rather than something this file has to remember.
                 */}
                <ActionMenuAnchor
                    render={
                        <NavbarItem
                            type="accent"
                            aria-label={t('nav_create')}
                            data-testid="navigation-navbar-create"
                            className="group"
                        >
                            {/*
                             * The `+` turns 45° into an `×` while the menu is open — base-ui puts
                             * `data-popup-open` on whatever it renders as the trigger, so the state
                             * is the primitive's and this is only its paint. It says "press again
                             * to close", which a static plus cannot; and 160ms `ease-out` is the
                             * popup's own timing, so the glyph turns *as* the panel arrives rather
                             * than after it.
                             *
                             * A transition, not one of the `@keyframes` entrances: this is a state
                             * the control holds, not something arriving, so under reduced motion
                             * the rotation must still *apply* — only instantly. Hence
                             * `motion-reduce:transition-none` and not `animate-none`.
                             *
                             * ⚠ It has to be `transition-transform`, the utility, and not a hand
                             * -written `transition-[transform]`. Tailwind v4's `rotate-*` sets the
                             * **`rotate` property**, not `transform` (the same trap `tevi-rise`
                             * records for `translate`), and CSS does not animate `rotate` under a
                             * `transform` transition. The utility expands to
                             * `transform, translate, scale, rotate`, which is what makes this run —
                             * verified in the browser, because the failure is a glyph that snaps
                             * with no error anywhere.
                             */}
                            <Icon
                                name="plus"
                                size={24}
                                className="transition-transform duration-[160ms] ease-out group-data-[popup-open]:rotate-45 motion-reduce:transition-none"
                            />
                        </NavbarItem>
                    }
                />
                <ActionMenuContent
                    side="inline-end"
                    align="center"
                    className="min-w-[300px]"
                    data-testid="navigation-navbar-create-menu"
                >
                    {create.options.map((option, index) => (
                        <ActionMenuItem
                            key={option.key}
                            data-testid="navigation-navbar-create-menu-item"
                            /* The row's identity is a companion attribute, never part of the id —
                               `docs/TEST_IDS.md`. */
                            data-option-value={option.key}
                            disabled={!option.onSelect}
                            onClick={option.onSelect}
                            className={cn('group/create-row h-auto gap-0', RISE)}
                            /* The panel scales in as one box; the rows arrive behind it 60ms
                               apart. `RISE` carries `both`, so a delayed row holds its opening
                               frame instead of flashing at full opacity first. */
                            style={riseDelay(index)}
                        >
                            <CreateOptionRow
                                option={option}
                                unavailableLabel={create.unavailableLabel}
                            />
                        </ActionMenuItem>
                    ))}
                </ActionMenuContent>
            </ActionMenu>

            {/* Raised by the `event` row only — creating a live event is the app's job, and this
                shell owns the id because the tab bar renders the same dialog. */}
            <GetAppDialog {...create.appPrompt} testId="navigation-navbar-create-prompt" />
        </>
    )
}
