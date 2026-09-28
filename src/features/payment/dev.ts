/**
 * Internals exposed to the `/dev/*` harnesses, and to nothing else.
 *
 * Same convention, and the same reason, as `features/membership/dev.ts`: the states worth
 * previewing are the ones no URL can reach. `/card-management` is behind **an account that has saved a
 * card**, and saving one means a real Stripe SetupIntent and a real card number — so a design pass on
 * the row previously meant either doing that or faking an API response.
 *
 * `SavedCardList` and `CardManagementSkeleton` are pure props, so the harness renders the shipped
 * components with the shipped copy rather than a mock of them. `CardManagementView` is deliberately
 * **not** here: it owns the query, the auth gate and three dialogs, and a version of it that did not
 * would be a second implementation of the screen with its own drift.
 */

export { MAX_SAVED_CARDS } from './api/payment-methods-api'
/**
 * The Star sheet's own pieces.
 *
 * `StarPurchaseDialog` is **not** here: it takes the machine's action and the checkout callbacks, so a
 * harness rendering it would be re-implementing `PaymentProvider` — and the two would drift. What is
 * previewable is the parts whose props are data: the grid and the gateway list, which is where every
 * visual decision on step 1 and step 2 lives.
 */
export type { Gateway, SavedCard, StarPackage, StarTransaction } from './api/types'
export { CardManagementSkeleton } from './components/card-management-skeleton'
export { GatewayAccordion } from './components/gateway-accordion'
export { GatewayList } from './components/gateway-list'
/**
 * The **loading** and **not-supported** halves of `/get-star`, which no URL reaches: loading is a
 * network round-trip long, and "not supported" needs a region with no gateway enabled — the real
 * page can only be pushed into it by intercepting the request.
 */
export { GetStarSkeleton } from './components/get-star-skeleton'
export { StarCatalogueUnavailable } from './components/get-star-view'
export { SavedCardList } from './components/saved-card-list'
export { StarPackageGrid } from './components/star-package-grid'
/**
 * The purchase list, without the screen around it — the real one needs an account that has actually
 * bought Star, so this is the only place its month headers, its three statuses and a gateway with no
 * logo can be seen together. Same reason `LedgerRow` is exported.
 */
export { TransactionList, TransactionSkeleton } from './components/transaction-history-view'
export { CARD_MANAGEMENT_CONTAINER } from './lib/container'
