import { ANALYTICS_CONTAINER, DashboardAnalyticsView } from '@features/analytics'
import { PageBackBar } from '@features/navigation'
import { getServerT } from '@shared/i18n/server'
import type { Metadata } from 'next'

/**
 * `/dashboard-analytics` — the creator's own performance report.
 *
 * Legacy's URL, unchanged (`pages/dashboard-analytics`), because links to it exist outside this repo:
 * the mobile app opens it in a webview and deep-links a window with `?start_date_ts`/`?end_date_ts`,
 * which `useDashboardAnalytics` still reads. The cutover is same-origin, so the path is a contract.
 *
 * A sub-page, so it sits in `(main)` and **not** in `(tabs)`: it brings its own back bar instead of
 * the global mobile top bar. In `(rail)` because its column is 612 — the end rail is anchored to that
 * width, which is what that group's layout means by "adding a route".
 *
 * ## Everything below the bar is client code, and it has to be
 *
 * All four requests are `report/*` **as this bearer**, and there is no SSR bearer in this app by
 * construction (`shared/lib/api/token.ts`). So the server renders the shell, the bar and the title,
 * and the figures resolve after hydration. `createServerApiModel` could not improve this: that client
 * is for public content, and a revenue dashboard is the opposite of public.
 *
 * There is a second reason here, and it is not about auth: every date on this screen is a **local**
 * calendar boundary (`features/analytics/lib/periods.ts`), and the server's zone is not the reader's.
 * Resolving "the last 30 days" on the server would produce a different 30 days than the caption under
 * it claims. See `useDashboardAnalytics`, which resolves the range on mount for exactly that reason.
 *
 * ## `noindex, nofollow`, and deliberately **not** in `robots.ts`
 *
 * A creator's own revenue: different for every visitor, meaningless to a crawler, and money. Legacy
 * sets the same pair on this route.
 *
 * Disallowing it in `robots.ts` would be the reflex and it is the wrong move, for the reason the
 * earnings report and `/my-star` both write down: a disallowed URL is one a crawler never *fetches*,
 * so it never reads the `noindex` either — and a URL linked from the account drawer on every screen
 * can still surface as a bare address. Crawlable + `noindex` is the combination that actually keeps
 * it out of the index.
 */
export async function generateMetadata(): Promise<Metadata> {
    const t = await getServerT()
    return {
        title: t('analytics_title'),
        alternates: { canonical: '/dashboard-analytics' },
        robots: { index: false, follow: false },
    }
}

export default async function DashboardAnalyticsPage() {
    const t = await getServerT()

    return (
        <main className="flex flex-1 flex-col">
            {/* Opaque and sticky, as on `/my-star`: the content scrolls under the bar, so a
                transparent one would show the chart through the title. No hairline — the cards below
                bring their own edges and a full-bleed rule would only draw a second one. */}
            <div className="sticky top-0 z-20 bg-(--background)">
                <PageBackBar title={t('analytics_title')} className={ANALYTICS_CONTAINER} />
            </div>
            <div className={`${ANALYTICS_CONTAINER} flex flex-1 flex-col pb-6`}>
                <DashboardAnalyticsView />
            </div>
        </main>
    )
}
