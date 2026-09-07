/**
 * `/redeem-gift-code`'s address, and nothing else.
 *
 * ## An import-free module, for the reason `features/my-star/routes.ts` gives
 *
 * `features/navigation` links here — the account drawer's REWARDS row. Routed through this
 * feature's main `index.ts`, that is a cycle between two barrels (the drawer renders screens
 * from features that link back to it), which ESM resolves by handing one side a
 * half-initialised module: not a build error but an `undefined is not a function` at render
 * time, on whichever side was evaluated second.
 *
 * `menu-rows.ts` is a *data* module with no JSX and no hooks, so it is the cheapest possible
 * consumer of a path — and it must stay that way. It imports `@features/gift-code/routes`,
 * never `@features/gift-code`.
 *
 * ## The address is legacy's, unchanged
 *
 * Legacy's drawer row points at `/redeem-gift-code` (`btnRedeemGiftCode`), so the URL is
 * already in the wild — in help-desk replies, in gift-card inserts, in whatever a support
 * agent has pasted for the last two years. Keeping it means `proxy.ts` needs no redirect for
 * this screen and no printed card stops working at cutover.
 */

/** `/redeem-gift-code` — enter a gift code or gift card, and see what it contained. */
export const GIFT_CODE_PATH = '/redeem-gift-code'
