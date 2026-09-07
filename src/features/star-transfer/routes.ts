/**
 * `/star-transfer`'s address, and nothing else.
 *
 * ## An import-free module, for the reason `features/my-star/routes.ts` gives
 *
 * `features/navigation` links here — the account drawer's SERVICES row, which is gated on
 * `can('star-transfer')`. Routed through the main `index.ts`, that is a cycle between two barrels
 * (this feature's view reaches into `features/channel` for its empty states, and `features/channel`
 * is on the drawer's own import path), which ESM resolves by handing one side a half-initialised
 * module: not a build error but an `undefined is not a function` at render time, on whichever side
 * was evaluated second.
 *
 * `menu-rows.ts` is a *data* module with no JSX and no hooks, so it is the cheapest possible consumer
 * of a path — and it must stay that way. It imports `@features/star-transfer/routes`, never
 * `@features/star-transfer`.
 *
 * ## The address is legacy's, unchanged
 *
 * `/star-transfer` is where the legacy screen lives (`pages/star-transfer`), so there is nothing for
 * `proxy.ts` to redirect: a link out in the wild, a bookmark or an email from support lands on this
 * screen at the same URL it always did.
 */

/** `/star-transfer` — moving Star to another account, singly or in bulk. */
export const STAR_TRANSFER_PATH = '/star-transfer'
