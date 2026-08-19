import { PASSWORD_SETTINGS_PATH } from '@features/auth'
import { BLOCKED_ACCOUNTS_PATH, SPACE_VISIBILITY_PATH } from '@features/channel'
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
 * whose parent row silently never marks. The screens that own no route — the pickers, Data
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
    'data-storage': [],
    'privacy-security': [PASSWORD_SETTINGS_PATH, SPACE_VISIBILITY_PATH, BLOCKED_ACCOUNTS_PATH],
}

/** Whether the current page is one this pushed screen links to (or lives under). */
export function isViewActive(pathname: string, view: DrawerView): boolean {
    return VIEW_PATHS[view].some(href => isPathActive(pathname, href))
}

/**
 * "You are here", for everyone and not just screen readers. Keyed on `aria-current` being
 * present at all rather than on `=page`, so the same one class paints the row of the current
 * page (`page`) and the row of the screen containing it (`location`) — see `menu-drawer`'s
 * `rowAction` for why those two values differ.
 *
 * The Primary ramp inverts with the theme, so one tint works in both modes.
 *
 * `--primary-100`, not `--primary-50`: the rows sit on `--background-surface`, which is
 * `#ffffff` in light mode, and Primary 50 there is `#f6f2fe` — a two-percent tint that is
 * not a state anyone can see. Primary 100 (`#ede4fd` light, `#210b52` on `#18181b` dark)
 * reads as marked in both modes and is still quieter than a selected control.
 */
export const MENU_ROW_ACTIVE_CLASS = 'aria-[current]:bg-(--primary-100)'
