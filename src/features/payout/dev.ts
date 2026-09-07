/**
 * Internals for the `/dev/payout` harness, and for nothing else.
 *
 * The two blocks below are the **request** screen's, and it is the one payout screen with no reachable
 * route in development: `/my-wallet/payout-request` needs a signed-in creator who has configured a
 * withdraw destination, and without one the page `router.replace`s to `setup-payouts` before anything
 * renders. So the fee breakdown and the speed cards — including the three help dialogs legacy hangs off
 * them, which is what this harness was added to check — could not be looked at at all.
 *
 * Kept out of `index.ts` for the usual reason: production imports no harness.
 */
export type { PayoutOption, PayoutQuote } from './api/payout-request-api'
export { PayoutOptionCards } from './components/payout-option-cards'
export { PayoutRequestSummary } from './components/payout-request-summary'
