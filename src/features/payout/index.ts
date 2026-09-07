/**
 * `features/payout` — the five withdrawal screens under `/my-wallet`.
 *
 * ## Its own feature, and not part of `features/my-wallet`
 *
 * `/my-wallet` is a **summary**: a balance, three rows out, recent movements. These are the screens
 * those rows lead to — a request flow, the configured methods, the tracking list, one request in full,
 * and the setup forms. Together they are ~11k lines in legacy across 88 files, with their own
 * endpoints (`payout-request/`, `payout-configs/`, `payout-methods/`, `quote/`) and their own
 * vocabulary of statuses and method types. Folding that into the wallet would make one feature out of
 * two subjects; `features/my-star` and `features/my-wallet` already draw the same line.
 *
 * The dependency runs one way. This feature takes the wallet's **address** (`@features/my-wallet/routes`)
 * and nothing else from it; the wallet takes this feature's addresses (`./routes`) for its action rows.
 * Both sides import the import-free routes module rather than the barrel, which is what keeps the pair
 * out of a module cycle — see `./routes.ts`.
 *
 * ## What is here so far
 *
 * Three of the five: `payout-tracking`, `payout-method` and `setup-payouts`.
 *
 * Tracking was built first because it is read-only, so billy's payout contract — the status
 * vocabulary, `net_amount` arriving as a string, the `count` that is not always there — was settled
 * before a screen that moves money depended on any of it. The two setup screens came next, and they
 * are what makes a payout *possible*: `payout-request` (the flow that spends the balance) is the one
 * still missing, and it needs a saved method to spend it into.
 *
 * The per-method knowledge those two screens need is data, not components — `lib/payout-method-form.ts`
 * derives every field, label and payload from what `payout-methods/` describes, which is what keeps a
 * method the backend adds next quarter from needing a release here. Read that file before touching a
 * form: it is where legacy's three payload oddities are reproduced (and one is deliberately not).
 */

export type {
    PayoutConfigRow,
    PayoutCountry,
    PayoutFormChoice,
    PayoutFormField,
    PayoutMethodOption,
} from './api/config-types'
export {
    PAYOUT_CONFIG_PAGE_SIZE,
    PAYOUT_PAGE_SIZE,
    payoutApi,
    payoutKeys,
} from './api/payout-api'
export type { PayoutFee, PayoutRequest, PayoutRequestDetail, PayoutStatus } from './api/types'
export { normalizePayoutRequestDetail, normalizePayoutRequests } from './api/types'
/**
 * Exported for `/dev/payout`: the real screen needs a signed-in creator who has requested a payout, so
 * the folds, the fee arithmetic and the timeline are otherwise unreachable. All pure props.
 */
export { PayoutAmountRows, PayoutConfigRows } from './components/payout-detail-rows'
export { PayoutDetailSkeleton } from './components/payout-detail-skeleton'
export { PayoutDetailView } from './components/payout-detail-view'
export { PayoutDisclosure } from './components/payout-disclosure'
/**
 * Exported for `/dev/payout`: the saved-method row and its dialog need a signed-in creator who has
 * already configured a payout destination, so every state of them — the error status, the missing
 * daily limit, the per-method detail table — is otherwise unreachable in dev. Pure props.
 */
export { PayoutMethodDetailDialog } from './components/payout-method-detail-dialog'
export { PayoutMethodRow } from './components/payout-method-row'
export { PayoutMethodSkeleton } from './components/payout-method-skeleton'
export { PayoutMethodView } from './components/payout-method-view'
/**
 * Exported for `/dev/payout`: the real screen needs a signed-in creator who has actually requested a
 * payout, so without a preview a design pass on the row means faking an API response. Pure props.
 */
export { PayoutRequestRow } from './components/payout-request-row'
export { PayoutRequestSkeleton } from './components/payout-request-skeleton'
export { PayoutRequestView } from './components/payout-request-view'
export { PayoutStatusChip, PayoutTimeline } from './components/payout-timeline'
export { PayoutTrackingView } from './components/payout-tracking-view'
export { SetupPayoutsView } from './components/setup-payouts-view'
export {
    PAYOUT_CARD,
    PAYOUT_CARD_CONTAINER,
    PAYOUT_CONTAINER,
    PAYOUT_PANEL,
    PAYOUT_SCREEN,
} from './lib/container'
export { PAYOUT_ART } from './lib/illustrations'
export { humanisePayoutStatus, payoutStatus } from './lib/payout-status'
export {
    PAYOUT_METHOD_PATH,
    PAYOUT_REQUEST_PATH,
    PAYOUT_TRACKING_PATH,
    payoutDetailPath,
    SETUP_PAYOUTS_PATH,
} from './routes'

/**
 * Deliberately **not** exported: `usePayoutRequests`, `usePayoutConfigs`, `useSetupPayouts`.
 *
 * A component calling one of them outside this feature would be a second list of the same data with
 * its own page state — or, for the setup hook, a second form posting to the same endpoint. The screens
 * are the export.
 */
