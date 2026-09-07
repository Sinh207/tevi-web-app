import {
    ANALYTICS_CONTAINER,
    AnalyticsSkeleton,
    MetricChart,
    TopEarningCard,
} from '@features/analytics'
import { ChannelEmptyState } from '@features/channel'
import { Button } from '@shared/ui/button'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import {
    METRICS,
    NO_POINTS_METRIC,
    SINGLE_POINT_METRIC,
    TINY_MONEY_METRIC,
    TOP_EARNING,
} from './fixtures'
import { AnalyticsPreview } from './preview'

export const metadata: Metadata = {
    title: 'Dashboard analytics',
    robots: { index: false, follow: false },
}

/**
 * Dev-only preview of `/dashboard-analytics`'s parts and states: `pnpm dev`, then open
 * `/dev/dashboard-analytics`. 404s in production (`proxy.ts` stops the request; the `notFound()`
 * below is the belt to those braces).
 *
 * It exists for the reason `/dev/earnings` and `/dev/my-star` do — the real screen is **unreachable
 * without a signed-in creator who has actually earned money in the selected window**, so a design
 * pass on it otherwise means faking an API response or waiting for a payout. Worse than those two,
 * the interesting part here is a *chart*, and a chart is the one component you cannot review by
 * reading its props.
 *
 * `DashboardAnalyticsView` itself is deliberately **not** previewed: it owns four queries, a session
 * gate and a mutation, and a version of it that did not would be a second implementation of the
 * screen with its own drift. Its message states are `ChannelEmptyState` with different copy, shown
 * below with the shipped strings.
 *
 * Copy is inlined rather than translated: a dev preview that needed i18n plumbing would be a second
 * consumer of every key. The strings are the `en` values verbatim, which also makes a drift visible.
 */

/** The fixtures' own window — 30 days ending 19 Feb 2025 — so nothing here moves with the clock. */
const RANGE = {
    startMs: new Date(2025, 0, 21).getTime(),
    endMs: new Date(2025, 1, 19, 23, 59, 59, 999).getTime(),
}

export default function DevDashboardAnalyticsPage() {
    if (process.env.NODE_ENV === 'production') notFound()

    return (
        <main className="flex flex-col gap-10 p-6">
            <header className="flex flex-col gap-1">
                <h1 className="type-title-t1-bold text-(--text-title)">Dashboard analytics</h1>
                <p className="type-dense-default text-(--text-body)">
                    `features/analytics` — the period bar, the metric strip and the trend chart, as
                    `/dashboard-analytics` composes them. The bar, the tabs, the hover and the
                    custom-range dialog are live; nothing here fetches or writes.
                </p>
            </header>

            <section className="flex flex-col gap-2">
                <h2 className="type-micro-overline text-(--text-body)">
                    the screen — hover the plot, or focus it and use ← →
                </h2>
                <div className={ANALYTICS_CONTAINER}>
                    <AnalyticsPreview metrics={METRICS} initialRange={RANGE} />
                </div>
            </section>

            <section className="flex flex-col gap-2">
                <h2 className="type-micro-overline text-(--text-body)">
                    the plot's edge cases — two cents, one bucket, and none at all
                </h2>
                <div className={`${ANALYTICS_CONTAINER} flex flex-col gap-3`}>
                    {/* The axis a cent-sized domain gets: `$0 · $0.01 · $0.02`, three distinct
                        labels. It used to print `$0.01` and `$0.02` twice each. */}
                    <div className="rounded-[var(--radius-xl)] border border-(--separator-default) bg-(--background-surface)">
                        <MetricChart metric={TINY_MONEY_METRIC} compare className="p-4" />
                    </div>
                    {/* A single point draws no line, so the dot *is* the chart — and it is centred
                        rather than pinned to the edge, which would read as clipping. */}
                    <div className="rounded-[var(--radius-xl)] border border-(--separator-default) bg-(--background-surface)">
                        <MetricChart metric={SINGLE_POINT_METRIC} compare className="p-4" />
                    </div>
                    <div className="rounded-[var(--radius-xl)] border border-(--separator-default) bg-(--background-surface)">
                        <MetricChart metric={NO_POINTS_METRIC} compare className="p-4" />
                    </div>
                </div>
            </section>

            <section className="flex flex-col gap-2">
                <h2 className="type-micro-overline text-(--text-body)">
                    top earning content — the payload shapes a row has to survive
                </h2>
                <div className={ANALYTICS_CONTAINER}>
                    <TopEarningCard items={TOP_EARNING} />
                </div>
            </section>

            <section className="flex flex-col gap-2">
                <h2 className="type-micro-overline text-(--text-body)">loading</h2>
                <div className={ANALYTICS_CONTAINER}>
                    <AnalyticsSkeleton />
                </div>
            </section>

            <section className="flex flex-col gap-2">
                <h2 className="type-micro-overline text-(--text-body)">
                    empty · error · signed out
                </h2>
                {/*
                 * Three states, side by side, because the thing worth checking is that they read as
                 * different news at a glance — the error one changes only the glyph's colour.
                 */}
                <div className={`${ANALYTICS_CONTAINER} flex flex-col gap-3`}>
                    <div className="rounded-[var(--radius-xl)] border border-(--separator-default) bg-(--background-surface)">
                        <ChannelEmptyState
                            icon="chart-column-alt"
                            title="No data for this period"
                            body="There is no activity in the selected range. Try a different one."
                        />
                    </div>
                    <div className="rounded-[var(--radius-xl)] border border-(--separator-default) bg-(--background-surface)">
                        <ChannelEmptyState
                            icon="exclamation-diamond"
                            tone="error"
                            title="Your dashboard could not be loaded"
                            body="Something went wrong on our side. Try again in a moment."
                            action={
                                <Button variant="secondary" size="large">
                                    Try again
                                </Button>
                            }
                        />
                    </div>
                    <div className="rounded-[var(--radius-xl)] border border-(--separator-default) bg-(--background-surface)">
                        <ChannelEmptyState
                            icon="chart-column-alt"
                            title="Sign in to see your dashboard"
                            body="The report is tied to your account, so there is nothing to show without one."
                            action={
                                <Button variant="primary" size="large">
                                    Sign in
                                </Button>
                            }
                        />
                    </div>
                </div>
            </section>
        </main>
    )
}
