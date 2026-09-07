/*
 * The **`lib/routes` modules**, not the feature barrels, and this is not a style preference: those
 * barrels pull their whole feature in, and both features reach back into `features/navigation` — so
 * the import graph closes a cycle, ESM hands one side a half-initialised module, and `VIEW_PATHS`
 * below (built at module evaluation) captured `undefined` for whichever side lost the race. The
 * symptom was a drawer row that navigated correctly and silently stopped lighting up; the paths
 * printed fine anywhere the constants were read *later*, which is what made it look impossible.
 *
 * `menu-rows.ts` states the same rule in its own header and follows it for four other features. This
 * file is a data module too, and now follows it as well.
 */
import { PASSWORD_SETTINGS_PATH, TWO_FA_SETTINGS_PATH } from '@features/auth/lib/routes'
import { BLOCKED_ACCOUNTS_PATH, SPACE_VISIBILITY_PATH } from '@features/channel/lib/routes'
import type { DrawerView } from '../providers/menu-state'
import { OTHER_SETTINGS_ROWS } from './menu-rows'

/**
 * Which drawer row is "where you are" — one rule, in one place, for the root list and both
 * of its linking sub-screens.
 *
 * ## Why a row that navigates is not enough
 *
 * Marking the row whose `href` equals the pathname is the obvious half, and on its own it
 * is nearly invisible: nine of the drawer's ten destinations live on a **pushed** screen
 * (`/privacy`, `/terms` and four more under Other settings; `/settings/password`,
 * `/settings/space-visibility` and `/settings/blocked-accounts` under Privacy and security),
 * and reopening the drawer resets it to the root screen on purpose (`menu-state.tsx`). So
 * the marked row was rendered, parked off-screen, on every one of those routes — the drawer
 * showed no active state at all except on `/identification`, the single root-level link.
 *
 * `isViewActive` is the other half: the row that *pushes* a screen lights up when the
 * current page is one of the screen's own destinations, so the root list points at where
 * you are and drilling in confirms it. The paths come off the row data
 * (`OTHER_SETTINGS_ROWS`) or off the owning feature's exported constant, never off a
 * literal — a destination that gets added or moved must not be able to keep navigating
 * while quietly ceasing to light up.
 */

/**
 * The current page, or a page **inside** it.
 *
 * The subtree rule is what keeps `/settings/space-visibility/…` — or any nested screen a
 * destination grows later — from silently dropping the mark on the row that got you there.
 * `startsWith` on the path plus a separator, never a bare prefix: `/safety` must not match
 * `/safety-report`.
 */
export function isPathActive(pathname: string, href: string): boolean {
    if (pathname === href) return true
    // `/` is a prefix of every route, so the subtree rule cannot apply to it.
    if (href === '/') return false
    return pathname.startsWith(`${href}/`)
}

/**
 * What each pushed screen links to.
 *
 * An exhaustive `Record`, so adding a `DrawerView` is a type error here rather than a screen
 * whose parent row silently never marks. The screens that own no route — the three pickers, Data
 * and storage, and `root` itself, which is not something another row pushes to — say so with
 * an empty list instead of being absent.
 *
 * Privacy and security's rows are built in the component (each carries a live value), so
 * only their paths are restated here; both of the ones another feature owns come from that
 * feature's `routes.ts`.
 */
const VIEW_PATHS: Record<DrawerView, readonly string[]> = {
    root: [],
    'other-settings': OTHER_SETTINGS_ROWS.flatMap(row => (row.href ? [row.href] : [])),
    appearance: [],
    language: [],
    currency: [],
    'data-storage': [],
    'privacy-security': [
        PASSWORD_SETTINGS_PATH,
        TWO_FA_SETTINGS_PATH,
        SPACE_VISIBILITY_PATH,
        BLOCKED_ACCOUNTS_PATH,
    ],
}

/** Whether the current page is one this pushed screen links to (or lives under). */
export function isViewActive(pathname: string, view: DrawerView): boolean {
    return VIEW_PATHS[view].some(href => isPathActive(pathname, href))
}

/**
 * "You are here", for everyone and not just screen readers.
 *
 * Keyed on `aria-current` being present at all rather than on `=page`, so the same one class
 * paints the row of the current page (`page`) and the row of the screen containing it
 * (`location`) — see `menu-drawer`'s `rowAction` for why those two values differ.
 *
 * The Primary ramp inverts with the theme, so one tint works in both modes.
 *
 * `--primary-100`, not `--primary-50`: the rows sit on `--background-surface`, which is
 * `#ffffff` in light mode, and Primary 50 there is `#f6f2fe` — a two-percent tint that is
 * not a state anyone can see. Primary 100 (`#ede4fd` light, `#210b52` on `#18181b` dark)
 * reads as marked in both modes and is still quieter than a selected control.
 *
 * ## A **pill**, not a full-bleed band — and it is painted on a pseudo-element
 *
 * The tint used to be the row's own `background`, which is a full-bleed rectangle across the
 * card. That looked wrong the first time a row at the **top** of a card was the current page
 * (`/dashboard-analytics`, once its drawer row got an `href`): five of the nine lists carry 8px
 * of vertical padding (`LeftBarList`'s `inset`), so the band started 8px below the card's
 * rounded corner and ran flush into its straight sides — a square-cornered slab sitting inside
 * a 16px radius, with a white strip above it. Reported as "menu item active background", and
 * the corner is where the eye lands first.
 *
 * A pill inset from the card's edges is the shape a padded card wants, and it reads the same
 * whether the row is first, last or in the middle — which a band never can.
 *
 * It is painted with `::before` rather than by insetting the row itself, because the row's own
 * box is load-bearing: its 48px height sets the rhythm, its `px-4` puts the tile where every
 * other row's tile is, and the separator between rows is positioned against its content box.
 * Moving any of those to make room for a highlight would shift the list the moment a row became
 * current. `isolate` gives the row a stacking context so `-z-10` lands the tint above the row's
 * background and below all of its content — without it the pseudo-element paints over the
 * leading tile, because a positioned box outranks the static ones beside it.
 *
 * Geometry: 8px in from the sides (the card's own padding) and 4px from the top and bottom, so a
 * 48px row carries a 40px pill at Radius LG. Not fully inset vertically: 8px would leave a 32px
 * pill in a 48px row, which reads as a chip somebody dropped in rather than as the row itself
 * being marked.
 */
export const MENU_ROW_ACTIVE_CLASS = [
    /*
     * `relative` **and** `isolate`: the first makes the row the containing block the pill is inset
     * from (without it `absolute` resolves against the card, and the pill would be inset from the
     * card's edges instead of the row's), the second makes the row a stacking context so `-z-10`
     * stays inside it.
     */
    'aria-[current]:relative aria-[current]:isolate',
    "aria-[current]:before:absolute aria-[current]:before:content-['']",
    'aria-[current]:before:inset-x-2 aria-[current]:before:inset-y-1',
    'aria-[current]:before:-z-10 aria-[current]:before:rounded-[var(--radius-lg)]',
    'aria-[current]:before:bg-(--primary-100)',
].join(' ')
