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
                            aria-label={t('nav_create')}
                            data-testid="navigation-navbar-create"
                            /*
                             * **A 44px accent tile centred in the rail's 48px row** (`AppNavbar`'s
                             * `RAIL_ITEM`). The slot stays
                             * a transparent ghost item like every other row — the rail's rows are
                             * 56 + 8 apart and the selection indicator slides by exactly that, so
                             * the box must not change — and the colour is drawn smaller, inside it:
                             *
                             * - a full 56px accent block with a 20px glow outweighed the whole
                             *   column, the selected row included; at 44 it is the same proportion
                             *   to its slot as the tab bar's "+" is to its 64px pill;
                             * - 14px radius, a softer squircle than the 12px logo tile at the top
                             *   of the rail, so the two purple squares do not read as two logos;
                             * - the glow is quiet at rest (40%, 12px) and comes up with a 1px lift
                             *   on hover — light as feedback, not as a resting state.
                             *
                             * The ghost item's own hover ground is turned off: a grey 56 square
                             * behind the tile would be a frame around a button. Focus keeps the
                             * item's DS ring, around the whole slot.
                             */
                            // `p-0`: the DS item pads its glyph by 16, which leaves a 24px content
                            // box — the 44px tile was squeezed into a 24-wide pill by flex.
                            className="group size-12 bg-transparent p-0 [&:hover:not(:disabled):not([data-state])]:bg-transparent"
                        >
                            <span
                                className={cn(
                                    'relative flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-[14px] bg-(--button-accent-bg) text-(--white)',
                                    'shadow-[0_4px_12px_-4px_color-mix(in_srgb,var(--button-accent-bg)_40%,transparent),inset_0_1px_0_color-mix(in_srgb,var(--white)_28%,transparent)]',
                                    'transition-[translate,scale,box-shadow] duration-200 ease-out motion-reduce:transition-none',
                                    'group-hover:-translate-y-px group-hover:shadow-[0_8px_18px_-6px_color-mix(in_srgb,var(--button-accent-bg)_65%,transparent),inset_0_1px_0_color-mix(in_srgb,var(--white)_28%,transparent)]',
                                    'group-active:scale-95',
                                )}
                            >
                                {/* The highlight — light falling from the top-leading corner. */}
                                <span
                                    aria-hidden
                                    className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_90%_at_30%_10%,color-mix(in_srgb,var(--white)_30%,transparent),transparent_60%)]"
                                />
                                {/*
                                 * The `+` turns 45° into an `×` while the menu is open — base-ui
                                 * puts `data-popup-open` on whatever it renders as the trigger, so
                                 * the state is the primitive's and this is only its paint. 240ms on
                                 * the app's arrival curve, the tab bar's own timing.
                                 *
                                 * A transition, not a `@keyframes` entrance: a state the control
                                 * holds, so under reduced motion the rotation still *applies*, only
                                 * instantly. ⚠ `transition-[rotate]`, naming the property —
                                 * Tailwind v4's `rotate-*` sets `rotate`, not `transform`, and a
                                 * `transform` transition does not animate it (the failure is a
                                 * glyph that snaps with no error anywhere).
                                 *
                                 * `plus--filled`: the same drawing at a 2px stroke instead of 1.5,
                                 * which is what a glyph on a saturated tile needs to not look thin.
                                 */}
                                <span className="relative flex transition-[rotate] duration-240 ease-[cubic-bezier(0.32,0.72,0,1)] group-data-[popup-open]:rotate-45 motion-reduce:transition-none">
                                    <Icon name="plus" weight="filled" size={22} />
                                </span>
                            </span>
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
