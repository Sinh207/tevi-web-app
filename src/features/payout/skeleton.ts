/**
 * The payout screens' **loading shapes**, and the column they sit in — a second entry point, kept
 * deliberately small.
 *
 * ## Why this is not just an import from `./index`
 *
 * `loading.tsx` is a *server* module in the route tree. Importing a skeleton through the main barrel
 * pulls the whole feature in behind it — the views, their queries, `@features/auth`,
 * `@features/channel`, `@features/navigation`, TanStack Query — because a barrel is one module and
 * re-exports are not tree-shaken away before the client graph is built.
 *
 * That is not merely wasteful, it **broke the page**: the loading boundary became its own client entry
 * chunk, which the router injects in a way this app's CSP refuses — *"Loading the script
 * '…payout-tracking_loading_tsx_….js' violates the following Content Security Policy directive"*
 * (`shared/config/csp.ts` is nonce + `'strict-dynamic'`). The skeleton then never paints, and the only
 * symptom is one console line. Found in the browser on the first real render of the route, not by
 * reading — which is how a console-only failure on a *loading state* always surfaces.
 *
 * `features/analytics/skeleton.ts` is the same file for the same reason; read its note too.
 *
 * ⚠ Keep this import list shallow. Anything added here that reaches a hook, a query or another feature
 * puts the whole graph back in the loading chunk and the CSP error returns.
 */

export { PayoutDetailSkeleton } from './components/payout-detail-skeleton'
export { PayoutMethodSkeleton } from './components/payout-method-skeleton'
export { PayoutRequestSkeleton } from './components/payout-request-skeleton'
export { PAYOUT_CARD_CONTAINER, PAYOUT_CONTAINER, PAYOUT_SCREEN } from './lib/container'
