/**
 * Internals exposed to the `/dev/*` harnesses, and to nothing else.
 *
 * Same convention, and the same reason, as `features/channel/dev.ts` and `features/donation/dev.ts`:
 * the states worth previewing are the ones no URL can reach. This screen is behind **an account that
 * is actually paying a creator** — every row needs a live subscription, so a design pass on the row
 * meant either buying a membership or faking an API response.
 *
 * The row is pure props, so the harness renders the shipped component with the shipped copy rather
 * than a mock of it. `MyMembershipView` itself is *not* here: it owns two queries, and a version of it
 * that did not would be a second implementation of the screen with its own drift.
 */

/**
 * The query keys, so the harness can **seed** a payment history into the cache instead of the dialog
 * growing a prop only a preview would ever pass.
 *
 * Same convention, and the same reason, as `features/donation/dev.ts` exporting `donationKeys`: the
 * history is the one part of the dialog that needs a bearer, so without a seed the preview can only
 * ever show its error state — and the layout worth looking at (a scrolling ledger inside a card whose
 * heading stays put) only exists when there are rows.
 */
/**
 * The model, for **one** harness: `/dev/membership-checkout` stands in for the native app, and the
 * host's job on that screen is to call `subscribe/` with the USD price id. A stub that faked the
 * response instead would prove nothing about the flow it exists to exercise.
 *
 * Still withheld from `index.ts`, for the reason at the bottom of that file: a component calling the
 * model directly is what "never call axios from components" forbids, and this is a harness, not a
 * component.
 */
export { membershipApi, membershipKeys } from './api/subscription-api'
export type { Membership, MembershipPackage, PaymentHistory } from './api/types'
/**
 * The detail dialog, so the harness can open it against a fixture.
 *
 * It owns its payment-history query, which is the *only* part a signed-out preview cannot show — that
 * section renders its own error state and the rest of the dialog is pure props. Previewing it that way
 * beats not previewing it: the three footers (cancel / renew / ended) are the whole point of the
 * component and each one needs a differently-shaped membership to reach — including the two kinds of
 * expired row, one with a Star price (Renew) and one without (no button).
 */
export { MembershipDetailDialog } from './components/holdings/membership-detail-dialog'
export { MembershipRow } from './components/holdings/membership-row'
export { MyMembershipSkeleton } from './components/holdings/my-membership-skeleton'
/**
 * The content card's class, so the harness can compose the real `SearchBar`, the real `StickyTabs` and
 * real rows inside the **same** surface the screen uses rather than a hand-picked imitation of it.
 *
 * That composition is the one thing about this screen a browser cannot otherwise reach: every state
 * except signed-out needs an account that is actually paying a creator, so "does the card include the
 * search field" — the question this export exists to answer — was previously only checkable by reading
 * the JSX. Exporting the class rather than the component keeps `MyMembershipView` the single owner of
 * the queries; same trade `/dev/blocked-accounts` makes when it rebuilds that screen's panel by hand.
 */
export { SURFACE_CARD } from './components/holdings/my-membership-view'
/** The join dialogs, and the guard-free twin of their flow — see `/dev/become-a-member`. */
export { BecomeAMemberDialogs } from './components/join/become-a-member-dialogs'
export { useJoinMembershipPreview } from './hooks/join/use-join-membership-preview'
export { joinOffer } from './lib/join-offer'
