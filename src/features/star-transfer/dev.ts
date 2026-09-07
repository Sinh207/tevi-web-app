/**
 * Internals exposed to the `/dev/*` harnesses, and to nothing else.
 *
 * Same convention, and the same reason, as `features/donation/dev.ts` and `features/channel/dev.ts`:
 * the states worth previewing are the ones no URL can reach. On this screen that is most of them —
 * the whole route is behind `can('star-transfer')`, a grant only the backoffice can give, and the two
 * pieces below are behind something stricter still:
 *
 * - **the receipt** exists only after Star has actually been sent, which costs real money;
 * - **a history row** needs past transfers, which is the same precondition one page later.
 *
 * The mode tiles are cheap to reach with a grant and are here so a design pass can see the three
 * pieces side by side rather than in two places.
 *
 * Nothing here widens `index.ts`. `/dev/*` pages `notFound()` in production (see `proxy.ts`), so this
 * module has exactly one consumer and it does not ship.
 */

export type { TemplateRow, Transfer } from './api/types'
/**
 * The parser, not a hand-written `Transfer` literal. The harness builds its fixtures from **wire
 * shapes** and runs them through the real normaliser, so a preview cannot quietly disagree with
 * production about what a payload means — which is what a typed literal would allow (it would happily
 * carry a positive `stars` where the wire sends `-250`).
 */
export { normalizeTransfers } from './api/types'
/**
 * The two dialog stacks and the **real** flow hooks behind them.
 *
 * The hooks rather than a hand-built `flow` literal, which is the mistake `features/donation`'s dev
 * module records making once: an imitation of a state machine previews the imitation. Nothing in
 * either hook needs the grant — the capability gates the *screen*, in `StarTransferView` — so
 * `useSingleTransfer()` and `useMultiTransfer()` drive the real dialogs with the real arithmetic in a
 * harness. What a signed-out developer cannot reach through them is the write itself, which is where
 * `useRequireStars` correctly stops.
 */
export { MultiTransferDialog } from './components/multi-transfer-dialog'
export { SingleTransferDialog } from './components/single-transfer-dialog'
export { TransferHistoryRow } from './components/transfer-history-row'
export { TransferModeTiles } from './components/transfer-mode-tiles'
export { TransferReceiptScreen } from './components/transfer-receipt-screen'
export type { MultiTransferFlow } from './hooks/use-multi-transfer'
export { useMultiTransfer } from './hooks/use-multi-transfer'
export { useSingleTransfer } from './hooks/use-single-transfer'
/**
 * The bulk plan's arithmetic, exported so the harness can reach the **review** screen — the one surface
 * in this feature that no developer can open, because it is behind a validated CSV, which is behind the
 * grant *and* an account the backend will accept an upload from.
 *
 * The harness fakes the *transport* (a fixture in place of the validation response) and nothing else:
 * `planTransfers` and `withoutReceiver` are the shipped functions, so the preview cannot disagree with
 * production about what will be sent. That is the line `features/donation`'s dev module draws — its
 * preview hook exists precisely so a harness does not re-implement a feature's maths.
 */
export { planTransfers, withoutReceiver } from './lib/transfer-rules'
