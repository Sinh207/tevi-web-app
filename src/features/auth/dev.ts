/**
 * Internals exposed to the `/dev/*` harnesses, and to nothing else.
 *
 * Same convention, and the same reason, as `features/star-transfer/dev.ts`: the states worth
 * previewing are the ones no URL can reach. For two-step verification that is **four of the five
 * steps**, and they are behind a stack of preconditions no developer can fake locally:
 *
 * - `two_fa_passcode: true` on a real `/me`, which only an account that has set a passcode carries;
 * - a live `recover/`, which mails a code to an inbox;
 * - and that six-digit code, which is the only way past the second step.
 *
 * So before this file the recovery flow could not be looked at — not by a designer, not by whoever
 * ports the next screen. `TwoFaDialogBody` takes a `TwoFaFlow` and builds none, which is the seam that
 * makes a preview possible; the dialog itself still owns the machine.
 *
 * Nothing here widens `index.ts`. `/dev/*` pages `notFound()` in production (see `proxy.ts`), so this
 * module has exactly one consumer and it does not ship.
 */

export { TwoFaDialogBody } from './components/two-step-verification-dialog'
// The two types the harness builds its fixture from, and nothing else: `PASSCODE_LENGTH` and
// `HINT_MAX_LENGTH` were exported here too and had no consumer — a dev barrel accumulates those
// silently, since nothing lints an unused export.
export type { TwoFaFlow, TwoFaStep } from './hooks/use-two-fa-flow'
