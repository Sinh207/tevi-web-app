/**
 * `/dashboard-analytics`'s address, and nothing else.
 *
 * ## An import-free module, for the reason `features/gift-code/routes.ts` gives
 *
 * `features/navigation` links here — the account drawer's CREATORS row. Routed through this
 * feature's main `index.ts`, that is a cycle between two barrels (the drawer renders screens from
 * features whose views reach back into shared feature barrels), which ESM resolves by handing one
 * side a half-initialised module: not a build error but an `undefined is not a function` at render
 * time, on whichever side was evaluated second.
 *
 * `menu-rows.ts` is a *data* module with no JSX and no hooks, so it is the cheapest possible consumer
 * of a path — and it must stay that way. It imports `@features/analytics/routes`, never
 * `@features/analytics`.
 *
 * ## The address is legacy's, unchanged
 *
 * `pages/dashboard-analytics`. Links to it exist outside this repo — the mobile app opens it in a
 * webview and deep-links a window with `?start_date_ts`/`?end_date_ts` — and the cutover is
 * same-origin, so the path is a contract rather than a choice. Keeping it means `proxy.ts` needs no
 * redirect for this screen.
 */

/** `/dashboard-analytics` — the creator's own performance report. */
export const DASHBOARD_ANALYTICS_PATH = '/dashboard-analytics'
