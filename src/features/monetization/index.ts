/**
 * The monetization feature — a creator's own earning dashboard.
 *
 * Three screens, all at legacy's URLs, all reached from the CREATORS section of the account drawer:
 *
 * ```
 * /monetization                the hub — what you earned, and the four ways to earn
 * /monetization/membership     the tier you sell, and who is paying for it
 * /monetization/donation       the donation offer you publish, and who has paid it
 * ```
 *
 * The **hub owns no endpoint of its own**: its headline figure is `features/channel`'s channel-stats
 * query for the reader's own slug (legacy's `useHub` does exactly that), the balance and the display
 * currency are `features/balance`'s, and the four methods are a hard-coded table because legacy's is
 * one too — see `lib/methods.ts`, which carries the `// TODO: Replace with real API data` that has
 * been sitting over legacy's copy, and **B102**. The two method screens below it do own endpoints,
 * one service each way: `billy/v3/subscription/**` and `billy/v4/billing/donation/**`.
 *
 * Its own feature rather than a corner of `features/earnings` or `features/analytics`, even though
 * all three are a creator's money: they answer different questions (what a payout *was*, how a period
 * *performed*, and what is switched on) and share nothing but a reader. The two remaining method
 * screens — pay-per-post and interaction — will land here as siblings.
 *
 * The path lives in its own import-free `routes.ts`, which the account drawer imports instead of this
 * barrel — see that file for the module cycle it avoids.
 */

export { AnalyticsBanner } from './components/analytics-banner'
export { DonationDashboard } from './components/donation-dashboard'
export { MembershipDashboard } from './components/membership-dashboard'
export { MonetizationView } from './components/monetization-view'
export { RevenueCard } from './components/revenue-card'
export { RevenueCardSkeleton } from './components/revenue-card-skeleton'
export { RevenueInfoDialog } from './components/revenue-info-dialog'
export { StartEarningBanner } from './components/start-earning-banner'
/**
 * The creator's own membership tier.
 *
 * Exported because the **post composer** offers a members-only route and needs a tier id to
 * require. It is read by the host that mounts the composer, not by `features/post` — that feature
 * is reached through `features/channel`, so it cannot ask.
 */
export { useMyMembershipTier } from './hooks/use-my-membership-tier'
export {
    MEMBERSHIP_LIST_PANEL,
    MEMBERSHIP_PANEL,
    MEMBERSHIP_SCREEN,
    MONETIZATION_CONTAINER,
} from './lib/container'
export { DONATION_ART, MEMBERSHIP_ART, MONETIZATION_ART } from './lib/illustrations'
export type { MonetizationMethod, MonetizationMethodKey } from './lib/methods'
export { MONETIZATION_METHODS, REVENUE_WINDOW_DAYS } from './lib/methods'
export {
    MONETIZATION_DONATION_PATH,
    MONETIZATION_MEMBERSHIP_PATH,
    MONETIZATION_PATH,
} from './routes'

/**
 * Deliberately **not** exported: `creatorDonationApi`, its DTOs, `useMyDonationSetting`,
 * `useDonationOverview`, `useDonationForm`, `DonationSetupForm`, `DonationActionsMenu`,
 * `SupporterRow` and everything in `lib/donation-setting.ts`. A page mounts `DonationDashboard`;
 * the same reasoning as membership below, and one sharper reason: `DonationSetupForm` takes a
 * `DonationFormState` that only `useDonationForm` can build, so exporting the component without the
 * hook would be exporting something nobody can call — and exporting both would put a second copy of
 * the write on the page.
 *
 * Nor `creatorMembershipApi`, its DTOs, `useMyMembershipTier`,
 * `useSubscribers`, `useMembershipTierForm` and every part `MembershipDashboard` composes. A page
 * mounts the screen; a component calling the model directly is what `CLAUDE.md`'s "never call axios
 * from components" forbids, and exporting it is the invitation.
 *
 * Nor `useMonetizationHub`. A page mounts `MonetizationView`; a caller
 * that wanted the figures without the screen would be reaching for `features/channel`'s and
 * `features/balance`'s data through a third feature, and both of those already export them properly.
 */
