/**
 * What `/monetization`'s `loading.tsx` needs, and nothing that would drag the feature's component
 * tree into the loading chunk.
 *
 * One of the four sanctioned narrow barrels (`CLAUDE.md` → Boundary rules), and the reason is not
 * bundle size — it is that the page **breaks** otherwise. `loading.tsx` is a server module in the
 * route tree; importing anything through `index.ts` pulls the view, `@features/auth`,
 * `@features/balance` and `@features/channel` in behind it (a barrel is one module, and re-exports
 * are not tree-shaken before the client graph is built), the loading boundary becomes its own client
 * entry chunk, and this app's CSP — nonce plus `'strict-dynamic'` — refuses to load it. The skeleton
 * then silently never paints, which is a console-only failure on a *loading state*: the hardest kind
 * to notice. `features/star-transfer/skeleton.ts` carries the post-mortem.
 *
 * So everything reachable from here is hook-free and `'use client'`-free.
 */

export { DonationDashboardSkeleton } from './components/donation-dashboard-skeleton'
export { MembershipDashboardSkeleton } from './components/membership-dashboard-skeleton'
export { RevenueCardSkeleton } from './components/revenue-card-skeleton'
export { MEMBERSHIP_LIST_PANEL, MONETIZATION_CONTAINER } from './lib/container'
