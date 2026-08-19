/**
 * The app's chrome: the left rail, the mobile tab bar, the global top bar, the account
 * drawer, and the back bar every sub-page wears.
 *
 * `app/` composes these and holds no navigation logic of its own — which is the whole point
 * of the move out of `app/(web)/(main)/`: the same drawer is rendered by the rail, by the top bar
 * and by `/dev/left-bar`, and a route group is not a module.
 */

export { AppNavbar } from './components/app-navbar'
export { AppSide } from './components/app-side'
export { AppTabBar } from './components/app-tab-bar'
export { AppTopBar } from './components/app-top-bar'
export { AppEndRail } from './components/end-rail/app-end-rail'
export { MenuDrawer } from './components/menu/menu-drawer'
export { PageBackBar, PageBreadcrumb } from './components/page-back-bar'
/**
 * The tab bar plus the space it occupies, and the one decision of whether this route is a
 * tab destination at all. `(main)/layout.tsx` wraps its content in this instead of rendering
 * `AppTabBar` directly — see `lib/tab-destinations.ts` for why the answer is not a route group.
 */
export { TabBarShell } from './components/tab-bar-shell'
export { isTabDestination, TAB_PATHS } from './lib/tab-destinations'
export { type DrawerView, MenuProvider, useMenu } from './providers/menu-state'
