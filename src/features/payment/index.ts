/**
 * The payment feature — **taking money, and knowing whether it arrived.**
 *
 * ```
 * api/     paymee: the Stripe key, saved cards, the gateway + package catalogue, checkout & settling
 * lib/     the pure logic: the action union, the order → request builder, the state machine,
 *          the settle mapping and its schedule, the fee/total arithmetic, the callback URL parser
 * ```
 *
 * ## What this owns, and what it does not
 *
 * It owns **the act of paying**: creating an intent, completing it in the browser, and establishing
 * the outcome. It does not own any of the things being bought — a Star package, a donation, a
 * membership tier, Premium — and it does not own the ledger that shows what was spent
 * (`features/my-star`, `features/my-wallet`) or the balance itself (`features/balance`).
 *
 * Stripe Connect **payouts** are not here either. `billy/v5/billing/payout/stripe-onboard-link/` is
 * money going *out* to a creator; it belongs to the wallet screens and shares only the word "Stripe".
 *
 * ## Stripe is one branch of four
 *
 * Every checkout endpoint answers `{ action, action_data }` where `action` is
 * `STRIPE | REDIRECT | CODA | NOW_PAYMENT`. `lib/checkout-action.ts` parses that once; the state
 * machine drives all four. Legacy handles the union in three separate files, which is why the same
 * act of paying is a hosted redirect for Premium and an inline Elements form for Star.
 *
 * ## `handoff`: a membership is bought from billy, not from here
 *
 * `features/membership` owns `v3/subscription/.../subscribe/`, which answers the *same* envelope.
 * So that feature calls its own endpoint, parses the action, and hands it over as a `handoff` order.
 * This feature completes payments; it does not import another feature's API surface to do it.
 *
 * ## The import direction with `features/balance` is deliberate
 *
 * `payment` → `balance` (through its barrel): after a settle, the balance and both ledgers are
 * invalidated. `balance` → `payment`: **never**. `useRequireStars` announces a shortfall on the event
 * bus and this feature's provider opens the sheet — which keeps the two barrels acyclic and keeps the
 * promise `use-require-stars.ts` makes, that the day a purchase flow ships is one edit inside that
 * hook rather than a dozen at its call sites.
 *
 * ## The Stripe seam
 *
 * `lib/stripe-loader.ts` memoises `loadStripe` per publishable key **and is replaceable**, which is
 * what makes anything that calls `stripe.confirm*` testable; `lib/stripe-appearance.ts` resolves DS
 * tokens into Stripe's Appearance API, because Elements runs in an iframe and cannot read our CSS
 * variables. `components/stripe-elements-scope.tsx` is the only place `<Elements>` is mounted: it
 * holds the key, the appearance, the locale, and the one remount rule (`key={clientSecret}`).
 *
 * The CSP entries Stripe needs live in `shared/config/csp.ts` — `frame-src` for the field and 3DS
 * iframes, `connect-src` for `api.stripe.com`, and deliberately **nothing** in `script-src`.
 *
 * The order of the remaining passes, and the UI they build, is
 * [`docs/PAYMENT.md`](../../../docs/PAYMENT.md) §8.
 */

// ── The catalogue, the cards, the key ────────────────────────────────────────────────────────────
export { catalogApi } from './api/catalog-api'
// ── Starting a payment and settling it ──────────────────────────────────────────────────────────
export { checkoutApi, NoCheckoutRequestError, TRANSACTIONS_PAGE_SIZE } from './api/checkout-api'
export { paymentKeys } from './api/keys'
export { MAX_SAVED_CARDS, paymentMethodsApi } from './api/payment-methods-api'
export { stripeConfigApi } from './api/stripe-config-api'

// ── DTOs ─────────────────────────────────────────────────────────────────────────────────────────
export type {
    Gateway,
    GatewayCurrency,
    SavedCard,
    SettleOutcome,
    SetupIntent,
    StarPackage,
    StarTransaction,
    StarTransactionPage,
    StripeConfig,
} from './api/types'
/**
 * `normalizeSavedCards` is exported for one caller and it is not the website: the `/app/*` membership
 * checkout gets its card list from the **native host** over the JS bridge, not from
 * `payment/v3/my-payment-methods/`. Same payload (Stripe payment methods), same rules about which
 * rows are usable — so it is the same parser, rather than a second one that disagrees about an
 * expired card.
 */
export {
    normalizeSavedCards,
    normalizeStarTransactions,
    PENDING_SETTLEMENT_CODE,
    pickDefaultCard,
    STRIPE_GATEWAY_ID,
} from './api/types'
// ── Saved cards (pass 2) ────────────────────────────────────────────────────────────────────────
export { AddCardDialog } from './components/add-card-dialog'
// ── Paying by card, for any order (pass 5) ──────────────────────────────────────────────────────
export { CardCheckoutDialog } from './components/card-checkout-dialog'
export { CardManagementSkeleton } from './components/card-management-skeleton'
export { CardManagementView } from './components/card-management-view'
// ── The checkout engine (pass 3) ────────────────────────────────────────────────────────────────
export { CheckoutStatusDialog } from './components/checkout-status-dialog'
/**
 * The verdict's **mark**, without the dialog around it — for a surface that has no room for a modal.
 * The `/app/*` membership checkout draws its outcome in place; this is what stops the two surfaces
 * from owning two copies of the same table.
 */
export type { CheckoutStatusKind } from './components/checkout-status-tile'
export { CheckoutStatusTile, checkoutStatusKind } from './components/checkout-status-tile'
// ── Buying Star (pass 4) ────────────────────────────────────────────────────────────────────────
export { GatewayList } from './components/gateway-list'
export { GetStarHeader } from './components/get-star-header'
export { GetStarSkeleton } from './components/get-star-skeleton'
export { GetStarView, StarCatalogueUnavailable } from './components/get-star-view'
export { PayWithCardPanel } from './components/pay-with-card-panel'
export { SavedCardList } from './components/saved-card-list'
export { SavedCardRow } from './components/saved-card-row'
export { StarPackageGrid } from './components/star-package-grid'
export { StarPurchaseDialog } from './components/star-purchase-dialog'
// ── Mounting Elements ────────────────────────────────────────────────────────────────────────────
export { StripeElementsScope } from './components/stripe-elements-scope'
export {
    TransactionHistoryView,
    TransactionList,
    TransactionRow,
    TransactionSkeleton,
} from './components/transaction-history-view'
export { useAddCard, useCardSetupForm } from './hooks/use-add-card'
export type {
    CheckoutController,
    CheckoutSettledInfo,
    CheckoutSubmission,
} from './hooks/use-checkout'
export { useCheckout } from './hooks/use-checkout'
export { useCheckoutCallback } from './hooks/use-checkout-callback'
export { useGateways } from './hooks/use-gateways'
export type { GetStarFlow } from './hooks/use-get-star'
export { SHORTFALL_PARAM, useGetStar } from './hooks/use-get-star'
export type { UseSavedCardsResult } from './hooks/use-saved-cards'
export { useSavedCards } from './hooks/use-saved-cards'
export type { StarCatalogue } from './hooks/use-star-catalogue'
export { useStarCatalogue } from './hooks/use-star-catalogue'
export { useStarPackages } from './hooks/use-star-packages'
export type { StarPurchaseFlow, StarPurchaseStep } from './hooks/use-star-purchase'
export { useStarPurchase } from './hooks/use-star-purchase'
export type { UseStarTransactionsResult } from './hooks/use-star-transactions'
export { useStarTransactions } from './hooks/use-star-transactions'
export { useStripeConfig } from './hooks/use-stripe-config'
export {
    brandAssetName,
    cardBrandName,
    cardExpiry,
    isCardExpired,
    isCardPayable,
    maskedCardNumber,
    pickPayableCard,
    savedCardTitle,
} from './lib/card-brand'
// ── The action union ────────────────────────────────────────────────────────────────────────────
export type { ChargedAmount, CheckoutAction } from './lib/checkout-action'
export { isActionSupported, parseChargedAmount, parseCheckoutAction } from './lib/checkout-action'
// ── Coming back from a redirect ──────────────────────────────────────────────────────────────────
export type { CallbackIntent } from './lib/checkout-callback'
export {
    CALLBACK_PARAMS,
    hasCheckoutCallback,
    parseCheckoutCallback,
    SCREEN_PARAMS,
    stripCallbackParams,
    stripHandledParams,
} from './lib/checkout-callback'
// ── The machine ──────────────────────────────────────────────────────────────────────────────────
export type { CheckoutEvent, CheckoutState } from './lib/checkout-machine'
export {
    CHECKOUT_ERROR_KEYS,
    canDismissCheckout,
    checkoutActionOf,
    checkoutOrder,
    checkoutReducer,
    IDLE,
    isCheckoutBusy,
    isCheckoutSettled,
} from './lib/checkout-machine'
// ── Orders ───────────────────────────────────────────────────────────────────────────────────────
export type { CheckoutContext, CheckoutOrder } from './lib/checkout-order'
export { checkoutRequest, DEFAULT_GATEWAY_ID, isCardOnlyOrder } from './lib/checkout-order'
export {
    CARD_MANAGEMENT_CONTAINER,
    GET_STAR_CONTAINER,
    GET_STAR_TRANSACTIONS_CONTAINER,
    GET_STAR_TRANSACTIONS_SCREEN,
} from './lib/container'
// ── Money, and how a card prints ────────────────────────────────────────────────────────────────
export type { GatewayCharge } from './lib/gateway-fee'
export {
    formatCharge,
    gatewayFeeUsd,
    gatewayRatePerStar,
    gatewayTotal,
    isSymbolFirst,
    STAR_UNIT_PRICE_USD,
    USD_CURRENCY_ID,
} from './lib/gateway-fee'
export type { PurchaseKind } from './lib/purchase-kind'
export { offersMore, purchaseKind } from './lib/purchase-kind'
export { checkoutReturnUrl, checkoutReturnUrls } from './lib/return-url'
export { settledFrom, settleOutcomeFromError } from './lib/settle-outcome'
// ── Settling ─────────────────────────────────────────────────────────────────────────────────────
export type { SettlePollResult } from './lib/settle-poll'
export {
    runSettlePoll,
    SETTLE_MAX_ATTEMPTS,
    settleDelay,
    settleWindowMs,
} from './lib/settle-poll'
export {
    defaultPackage,
    MOST_POPULAR_INDEX,
    packageStars,
    pickPackageForShortfall,
    recommendedIndex,
} from './lib/star-packages'
export { stripeAppearance } from './lib/stripe-appearance'
export { getStripe, setStripeLoader } from './lib/stripe-loader'
export { stripeLocale } from './lib/stripe-locale'
export type { TransactionStatus } from './lib/transaction-status'
export { transactionStatus, transactionStatusKey } from './lib/transaction-status'
export type { PaymentValue } from './providers/payment-provider'
export { PaymentProvider, usePayment, usePaymentOptional } from './providers/payment-provider'
/**
 * Re-exported for the screen; `features/navigation` must keep importing `@features/payment/routes`
 * directly — that module is import-free precisely so a data module can read a path without pulling
 * this barrel and closing a cycle. See its own doc.
 */
export { CARD_MANAGEMENT_PATH, GET_STAR_PATH, GET_STAR_TRANSACTIONS_PATH } from './routes'
