/**
 * Internals exposed to the `/dev/*` harnesses, and to nothing else.
 *
 * Same convention, and the same reason, as `features/donation/dev.ts`: the states worth previewing
 * are the ones no URL can reach. Seeing this screen's result panel requires **a real, unused code**
 * — one that the billing or Premium service will accept — which a developer cannot mint and cannot
 * fake without spending a real gift. So the panel is driven by hand at `/dev/redeem-gift-code`.
 *
 * `RedeemFlow` is the shape a hand-built flow has to satisfy; the harness passes one with `result`
 * set and the two callbacks stubbed. Nothing here is reachable from the app.
 */
export type { RedeemOutcome } from './api/types'
export { RedeemResultDialog } from './components/redeem-result-dialog'
export type { RedeemFlow } from './hooks/use-redeem-code'
