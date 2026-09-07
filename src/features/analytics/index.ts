/**
 * The dashboard-analytics feature — a creator's own performance report.
 *
 * One screen (`/dashboard-analytics`, legacy's URL unchanged), reached from the Creators section of
 * the account drawer. Four requests, all to the **report** service and all derived from the bearer
 * rather than from anything in the URL — `api/analytics-api.ts` is the file to read first if
 * anything here looks odd, starting with why a feature called `analytics` does not talk to the
 * `/analytics` service.
 *
 * Its own feature rather than part of `features/earnings`, even though both read the report service
 * and both are a creator's money: they answer different questions (what a payout *was* versus how a
 * period *performed*), own different query keys, and share nothing but a service base URL. It
 * reaches into `features/channel` for `ChannelEmptyState` and into `features/auth` for
 * `useRequireAuth`, both through their barrels, which is what the boundary rules allow.
 *
 * The path lives in its own import-free `routes.ts`, which the account drawer imports instead of this
 * barrel — see that file for the module cycle it avoids. Same split as `features/gift-code`.
 */

export { analyticsKeys } from './api/analytics-api'
export type { ChannelStatMetric, MetricOption, TopEarningItem } from './api/types'
export {
    AnalyticsSkeleton,
    MetricPanelSkeleton,
    TopEarningSkeleton,
} from './components/analytics-skeleton'
export { DashboardAnalyticsView } from './components/dashboard-analytics-view'
/** Exported for `/dev/dashboard-analytics`, which previews the parts the real screen composes. */
export { MetricChart } from './components/metric-chart'
export { MetricTabs } from './components/metric-tabs'
export { PeriodBar } from './components/period-bar'
export { RangeSummary } from './components/range-summary'
export { TopEarningCard } from './components/top-earning-card'
export { ANALYTICS_CONTAINER } from './lib/container'
export { DASHBOARD_ANALYTICS_PATH } from './routes'

/**
 * Deliberately **not** exported: `analyticsApi`, `useDashboardAnalytics`, the normalizers and the
 * formatters. A component calling the model directly is what CLAUDE.md's "never call axios from
 * components" forbids, and exporting it is the invitation. The chart's geometry (`lib/chart.ts`)
 * stays in as well — it is tested in place, and a second screen wanting a line chart should get a
 * shared component rather than the arithmetic.
 */
