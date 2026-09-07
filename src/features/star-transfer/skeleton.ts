/**
 * `/star-transfer`'s **loading shape**, and the column it sits in — a second entry point, kept
 * deliberately small.
 *
 * ## Why this is not just an import from `./index`
 *
 * `loading.tsx` is a *server* module in the route tree. Importing `StarTransferSkeleton` through the
 * main barrel pulls the whole feature in behind it — the view, its dialogs, the CSV parsing, the
 * capability gate, `@features/auth`, `@features/balance`, TanStack Query — because a barrel is one
 * module and re-exports are not tree-shaken away before the client graph is built.
 *
 * That is not only wasteful, it **breaks the page**: the loading boundary becomes its own client entry
 * chunk, which the router injects in a way this app's strict CSP refuses (nonce + `'strict-dynamic'`,
 * `shared/config/csp.ts`) — *"Loading the script '…star-transfer_loading_tsx_….js' violates the
 * following Content Security Policy directive"* — and the skeleton then silently never paints. It is a
 * console-only failure on a *loading state*, which is the hardest kind to notice.
 *
 * `features/analytics/skeleton.ts` is the same door for the same reason and carries the post-mortem;
 * this file exists because `/star-transfer`'s `loading.tsx` was still importing the barrel.
 */

export { StarTransferSkeleton } from './components/star-transfer-skeleton'
export { STAR_TRANSFER_CONTAINER } from './lib/container'
