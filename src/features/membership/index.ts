/**
 * Membership, from the **reader's** side: starting one, holding one, ending one.
 *
 * One endpoint family (`billy/v3/subscription/**`), one subject — this account's relationship with a
 * paid tier. It is not the creator's side of membership (`my-packages/`, `benefits/`,
 * `my-channel-subscriptions/` — those belong to the monetization hub, `containers/monetization/*` in
 * legacy, and no feature here owns them yet), and not the wallet: `features/balance` owns the Star
 * figure and this feature never writes it.
 *
 * ```
 * <BecomeAMemberButton/>       the space action row's join control + its dialogs
 * useJoinFlow(target)          the same flow, headless — for a post, a live room, a message
 * <BecomeAMemberDialogs/>      the three dialogs, driven by a flow the caller holds
 * <MyMembershipView/>          the `/my-membership` screen below the page's back bar
 * MY_MEMBERSHIP_CONTAINER      its content column, shared with the page's bar
 * MY_MEMBERSHIP_PATH           its address (re-exported; the definition is in ./routes)
 * ```
 *
 * ## Two lanes inside one feature, and why it is not two features
 *
 * `components/join` + `hooks/join` sell a tier; `components/holdings` + `hooks/holdings` render
 * `/my-membership`. The split is real — `lib/join-offer.ts` is only join's, `lib/renewal.ts`,
 * `lib/payment-methods.ts`, `lib/membership-price.ts` and `lib/membership-date.ts` are only
 * holdings' — and it is a directory boundary rather than a feature boundary for one reason:
 * `subscribe/` is the same POST on both sides. Join is that call with a tier the reader has never
 * held; the detail dialog's Renew is that call on an expired row. Two features would give one
 * endpoint two owners and one `membershipPackageSchema` two copies.
 *
 * It used to be called `my-membership`, which named the screen instead of the subject — and this
 * feature ships UI to surfaces that have nothing to do with that screen. In this codebase `my-*`
 * means "a screen the account owns" (`my-star`, `my-wallet` export a path and nothing else), so the
 * name had to go. The **route** is still `/my-membership` and the keys are still `my_membership_*`:
 * legacy's address, kept so existing links and mobile deep links resolve.
 *
 * ## Joining is a `MembershipTarget`, never a `Channel`
 *
 * The space page is one caller. A locked post, a live room and a direct message all sell the same
 * tier, and none of them holds a `Channel` — legacy proves the cost of ignoring that: it wires
 * `becomeAMember` by hand in five places and each one spells the creator's identity differently. So
 * the subject is a four-field descriptor, the same shape as `features/donation`'s `DonationTarget`.
 *
 * When posts land, those surfaces should **not** import this barrel directly: a locked post has two
 * unlock paths, not one (legacy's `modal/unlockThisPost` takes `onJoinMembership` *and* `onPurchase`
 * for pay-per-post), so the composition point is a paywall feature and this flow is one strategy
 * behind it.
 *
 * ## The cash half is absent, in one place, on purpose
 *
 * A `USD` price id makes `subscribe/` answer a Stripe `clientSecret`. The flow hands that to
 * `features/payment` (`checkout({ kind: 'handoff' })`) where a `PaymentProvider` exists, and says so
 * plainly where one does not (a `/app/*` webview). What is still gated is the *offer*:
 * `lib/join-offer.ts` and `lib/renewal.ts` resolve `TVS` lines only, so a cash-only tier shows no
 * button rather than a dialog that cannot finish. Those two files are the whole change when
 * `docs/PAYMENT.md` §8 pass 4 lands.
 *
 * ## Its own feature, not part of `features/channel`
 *
 * A membership names a channel, which makes the temptation obvious. But `features/channel` is the
 * *space* — its profile, its walls, its settings, its owner tools — and it already imports this app's
 * money features (donation, earnings) rather than the reverse. Adding a subscriber's billing screen
 * to it would put a paginated money list inside the feature that renders every public page.
 *
 * So the dependency runs one way: this feature takes `ChannelEmptyState` and `toChannelPath` from
 * `@features/channel`, and nothing there knows this exists beyond a button and a target.
 * `features/my-star` and `features/my-wallet` sit in the same position, and what all three share is
 * in `shared/` — `sticky-tabs`, `use-in-view`, `money`, the DS list and search primitives — all
 * props-only, so `shared/` still imports nothing from `features/`.
 *
 * ## Two barrels, and it is a hard constraint rather than a preference
 *
 * `features/navigation` links here (the drawer's MY CONTENT row) and this feature reaches into
 * `features/channel`. Through one barrel each, those form a module cycle — and ESM resolves a cycle
 * by handing one side a half-initialised module, which surfaces as `undefined is not a function` at
 * render time rather than as a build error. So the address lives in `./routes`, which imports
 * nothing, and `features/navigation` imports **that**. This file must never become the drawer's
 * dependency.
 *
 * Same shape, and the same class of trap, as `features/my-star`'s and `features/earnings`'s splits.
 */

export type { MembershipTarget } from './api/types'
export { MyMembershipView } from './components/holdings/my-membership-view'
export { BecomeAMemberButton } from './components/join/become-a-member-button'
export { BecomeAMemberDialogs } from './components/join/become-a-member-dialogs'
/**
 * The webview checkout screen itself, because **two** things render it: the route
 * (`app/app/[channelSlug]/membership/[packageId]/page.tsx`) and `/dev/membership-checkout`. A screen
 * with two callers belongs in the feature, the same way `MyMembershipView` does — the alternative is
 * the harness importing out of `app/`, or previewing a second copy that drifts.
 */
export { MembershipCheckoutScreen } from './components/webview/membership-checkout-screen'
export { useJoinFlow } from './hooks/join/use-join-flow'
/**
 * The `/app/[channelSlug]/membership/[packageId]` webview checkout — the tier, the card and the
 * verdict, as one controller (plus `CashOffer`, which its header and summary read).
 *
 * Exported **alongside** `useJoinFlow` rather than instead of it, because they are two different
 * sales of the same tier: that one is the website's dialog over a space page and gates on Star; this
 * one is the screen the **native app opens to take a card**, and is the only place in the app where a
 * `USD` price id is the intended currency rather than a fallback.
 */
export type {
    MembershipCheckoutController,
    MembershipCheckoutStep,
} from './hooks/webview/use-membership-checkout'
export { useMembershipCheckout } from './hooks/webview/use-membership-checkout'
export type { CashOffer } from './lib/cash-offer'
export { MY_MEMBERSHIP_CONTAINER } from './lib/container'
export { MY_MEMBERSHIP_PATH } from './routes'

/**
 * Deliberately **not** exported: `membershipApi`, `membershipKeys`, `useMyMemberships`,
 * `useJoinMembership` on its own, the DTOs and everything else in `lib/`.
 *
 * A component calling the model directly is what `CLAUDE.md`'s "never call axios from components"
 * forbids, and exporting it is the invitation — the same reasoning `features/my-star/index.ts` and
 * `features/donation/index.ts` both spell out. `useJoinMembership` is withheld for a narrower
 * reason: called without the two queries beside it, it is a flow with no offer, so `useJoinFlow` is
 * the only correct entry point.
 *
 * The vocabulary is withheld for a second reason: the payment-method spellings are *this* endpoint's,
 * and a caller reaching for them from another screen would be offering filters nothing else can
 * answer.
 *
 * The pieces `/dev/*` needs are in `./dev.ts`, which is the harness's entry point and not the app's.
 */
