/**
 * Internals exposed to the `/dev/*` harnesses, and to nothing else.
 *
 * Same convention, and the same reason, as `features/channel/dev.ts`: the states worth previewing
 * are the ones no URL can reach. Every screen in this feature is behind **a creator who has set up a
 * donation offer** — there is no way to reach the dialog stack otherwise, and "the creator has an
 * offer" is not something a developer can arrange for themselves.
 *
 * `donationKeys` is here so the harness can seed a fake offer into the query cache rather than the
 * components growing a prop that only a preview would ever pass.
 */
export { donationKeys } from './api/donation-api'
/** Seeded by the harness so the cash tab can show a real fee without the payments service. */
export { donationFeeKeys } from './api/donation-fee-api'
export type { DirectDonate } from './api/types'
/**
 * The presentational half of the flow, exported so the harness can drive `step` by hand.
 *
 * Necessary rather than convenient: `useDonateFlow.open` runs through `useRequireAuth`, so a signed-out
 * developer pressing the real button gets the login dialog and **never reaches the dialogs at all** —
 * which is correct behaviour and makes the three screens unpreviewable exactly when you most want to
 * look at them. Passing a hand-built flow previews the component with controlled state, the same way
 * `/dev/space-visibility` passes `busy` and `softDisabled` to a card that normally computes them.
 */
export { DonateDialogs } from './components/donate-dialogs'
export { DonationArt } from './components/donation-art'
export type { DonateFlow, DonateStep } from './hooks/use-donate-flow'
/**
 * The guard-free, account-free twin of `useDonateFlow`, so the harness previews the dialogs with the
 * feature's own arithmetic rather than a hand-written imitation of it. See the file for what went
 * wrong the first time.
 */
export { useDonateFlowPreview } from './hooks/use-donate-flow-preview'
export type { DonationCurrency } from './lib/donation-amount'
