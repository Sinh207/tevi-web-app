/**
 * `/premium`'s address, and nothing else.
 *
 * ## An import-free module, for the reason `features/gift-code/routes.ts` gives
 *
 * Three surfaces in `features/navigation` link here — the drawer's POWER-UPS row, the mobile top
 * bar's badge button and the desktop end rail's promo card. Routed through this feature's main
 * `index.ts`, that is a cycle between two barrels (the shell renders screens from features that
 * link back to the shell), which ESM resolves by handing one side a half-initialised module: not a
 * build error but an `undefined is not a function` at render time, on whichever side was evaluated
 * second.
 *
 * `menu-rows.ts` is a *data* module with no JSX and no hooks, so it is the cheapest possible
 * consumer of a path — and it must stay that way. It imports `@features/premium/routes`, never
 * `@features/premium`.
 *
 * ## The address is legacy's, unchanged
 *
 * Legacy serves this screen at `/premium` (`pages/premium/index.js`), and that URL is already in
 * the wild — in the mobile app's own "Subscribe" links, in support replies, in the end-rail card
 * this repo shipped pointing at it before the route existed. Keeping it means `proxy.ts` needs no
 * redirect and nothing printed stops working at cutover.
 */

/** `/premium` — Tevi Premium: what it costs, what it unlocks, and how to subscribe. */
export const PREMIUM_PATH = '/premium'

/**
 * `/gift-premium` — buy Tevi Premium **for somebody else**.
 *
 * Legacy's own second screen (`containers/giftPremium`) at legacy's own address, so nothing printed
 * or linked stops working at cutover and `proxy.ts` needs no redirect. It lives beside
 * {@link PREMIUM_PATH} rather than in its own feature for the reason `index.ts` gives: one feature
 * owns *the Premium offer*, whether it is bought for oneself or for a creator.
 *
 * Here, and not in `lib/`, for the same cycle {@link PREMIUM_PATH} exists here for — this module
 * imports nothing, so a data module in `features/navigation` can read the path without pulling this
 * feature's barrel.
 */
export const GIFT_PREMIUM_PATH = '/gift-premium'
