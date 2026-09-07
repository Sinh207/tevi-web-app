/**
 * `/my-membership`'s address, and nothing else.
 *
 * ## An import-free module, for the reason `features/my-star/routes.ts` gives
 *
 * `features/navigation` links here — the account drawer's MY CONTENT row. Routed through this
 * feature's main `index.ts`, that is a cycle between two barrels (the drawer's config imports a
 * module that imports a screen that imports `features/channel`…), which ESM resolves by handing one
 * side a half-initialised module: not a build error, but `undefined is not a function` at render
 * time, on whichever side was evaluated second.
 *
 * `menu-rows.ts` is a *data* module with no JSX, so it is the cheapest possible consumer of a path —
 * and it must stay that way. It imports `@features/membership/routes`, never
 * `@features/membership`.
 *
 * ## The address is legacy's, unchanged
 *
 * `pages/my-membership/index.js`, kept so existing links and anything the mobile apps deep-link to
 * still resolve. Nothing in `proxy.ts` is needed for it — that list is for paths that *moved*.
 */

/** `/my-membership` — the memberships this account holds. */
export const MY_MEMBERSHIP_PATH = '/my-membership'
