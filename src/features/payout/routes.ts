/**
 * The payout screens' addresses, and nothing else.
 *
 * Import-free on purpose, the same call `features/my-wallet/routes.ts` makes: `/my-wallet`'s action
 * rows link here, and this feature reaches back into `@features/my-wallet` for the container width and
 * the wallet's own path. Through one barrel each that is a module cycle, which ESM resolves by handing
 * one side a half-initialised module — an `undefined is not a function` at render time rather than a
 * build error. So the addresses live here and the wallet imports **this**, never the barrel.
 *
 * All five are legacy's, unchanged: the mobile apps and legacy's own bookmarks point at them.
 */

/** `/my-wallet/payout-request` — ask for a withdrawal. */
export const PAYOUT_REQUEST_PATH = '/my-wallet/payout-request'

/** `/my-wallet/payout-method` — the methods this account has configured. */
export const PAYOUT_METHOD_PATH = '/my-wallet/payout-method'

/** `/my-wallet/payout-tracking` — every payout request, newest first. */
export const PAYOUT_TRACKING_PATH = '/my-wallet/payout-tracking'

/** `/my-wallet/payout-tracking/{id}` — one request in full. */
export function payoutDetailPath(id: string): string {
    return `${PAYOUT_TRACKING_PATH}/${id}`
}

/** `/my-wallet/setup-payouts` — add or edit a payout method. */
export const SETUP_PAYOUTS_PATH = '/my-wallet/setup-payouts'
