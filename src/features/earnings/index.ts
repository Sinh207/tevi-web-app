/**
 * The earnings-report feature — a creator's own daily payout ledger.
 *
 * One screen (`/@{slug}/earnings-report`, plus its deep-linked `[dateTs]` variant), reached from
 * the owner action row on the channel page. Everything it reads comes from the **report** service
 * and is derived from the bearer, not from the slug in the URL — see `api/earnings-api.ts`, which
 * is the file to read first if anything here looks odd.
 *
 * Its own feature rather than part of `features/channel` for the reason the boundary rules exist:
 * it talks to a different service, it owns its own query keys, and the only thing the channel
 * page needs from it is a URL. It reaches *into* `features/channel` for two things it must not
 * duplicate — `useMyChannel` (to answer "is this your report?") and `ChannelEmptyState` — both
 * through that feature's barrel, which is what the rule allows.
 *
 * ## Two barrels, and it is a hard constraint rather than a preference
 *
 * That "reaches back" is mutual: `features/channel`'s owner action row links *here*. Through one
 * barrel each, the two form a module cycle — and ESM resolves a cycle by handing one side a
 * half-initialised module, which surfaces as `undefined is not a function` at render time rather
 * than as a build error. So the addresses live in `./routes`, which imports nothing, and
 * `features/channel` imports **that**. This file must never become the channel page's dependency.
 *
 * Same shape, and the same class of trap, as `features/channel`'s own `index.ts` / `server.ts`
 * split.
 */

export { earningsKeys } from './api/earnings-api'
export type { EarningsCategoryAmount, EarningsDay } from './api/types'
export { EarningsDayRow } from './components/earnings-day-row'
export { EarningsReportSkeleton } from './components/earnings-report-skeleton'
export { EarningsReportView } from './components/earnings-report-view'
export { EARNINGS_CONTAINER } from './lib/container'
export { parseEarningsDateParam } from './lib/format'
/** Exported for `/dev/earnings`, so the preview draws the same artwork the screen does. */
export { EARNINGS_ART } from './lib/illustrations'
/**
 * The path the channel page's owner action row links to. A constant rather than a literal at that
 * call site, for the reason `features/channel/lib/routes.ts` gives: two features have to agree on
 * a URL that neither of them alone decides, and a literal keeps type-checking after the page
 * moves — it just 404s.
 */
export { earningsReportDayPath, earningsReportPath } from './lib/routes'

/**
 * Deliberately **not** exported: `earningsApi`, `useEarningsReport`, `useEarningsDayDetail`,
 * `REVENUE_CATEGORIES`, `earningsCategoryRows` and the formatters. A component calling the model
 * directly is what CLAUDE.md's "never call axios from components" forbids, and exporting it is
 * the invitation.
 *
 * `EarningsDayRow` and `EarningsReportSkeleton` *are* exported, for `/dev/earnings` — the screen
 * is otherwise unreachable without a signed-in creator who has actually earned money, which is
 * the same reason `BlockedAccountRow` is exported.
 */
