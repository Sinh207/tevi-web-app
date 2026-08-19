/**
 * `/my-star`'s address, and nothing else.
 *
 * ## An import-free module, for the reason `features/earnings/routes.ts` gives
 *
 * `features/navigation` links here — the account drawer's ASSETS row and the mobile top bar's Star
 * pill. Routed through the main `index.ts`, that is a cycle between two barrels, which ESM resolves by
 * handing one side a half-initialised module: not a build error but an `undefined is not a function` at
 * render time, on whichever side was evaluated second.
 *
 * `menu-rows.ts` is a *data* module with no JSX, so it is the cheapest possible consumer of a path —
 * and it must stay that way. It imports `@features/my-star/routes`, never `@features/my-star`.
 *
 * ## A new address, and the split it comes from
 *
 * Legacy has one screen at `/my-wallet` with two tabs, Star and Currency. The design splits them and
 * its handoff note says which half keeps the old address: *"bên My wallet bỏ phần Star đi"* — My wallet
 * loses the Star part. So `/my-wallet` stays put and narrows, and this is where the Star half went.
 * Legacy's `/my-wallet/transaction-history?currency=tvs` is redirected here in `proxy.ts`.
 */

/** `/my-star` — the Star balance and its ledger. */
export const MY_STAR_PATH = '/my-star'
