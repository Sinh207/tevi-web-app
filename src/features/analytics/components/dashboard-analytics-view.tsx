'use client'

import { useRequireAuth } from '@features/auth'
import { ChannelEmptyState } from '@features/channel'
import { useTranslation } from '@shared/i18n/use-translation'
import { RISE, riseDelay } from '@shared/lib/motion'
import { cn } from '@shared/lib/utils'
import { Button } from '@shared/ui/button'
import { useDashboardAnalytics } from '../hooks/use-dashboard-analytics'
import { AnalyticsSkeleton, MetricPanelSkeleton, TopEarningSkeleton } from './analytics-skeleton'
import { MetricChart } from './metric-chart'
import { MetricTabs } from './metric-tabs'
import { PeriodBar } from './period-bar'
import { RangeSummary } from './range-summary'
import { TopEarningCard } from './top-earning-card'

/**
 * `/dashboard-analytics` — everything below the page's back bar.
 *
 * ## Five states, and the two regions that hold them independently
 *
 * `docs/DEFINITION_OF_DONE.md` §1's loading / error / empty / success, plus **signed out** — the app
 * always keeps an anonymous session, so `currentUser` being present says nothing. An anonymous
 * visitor gets a prompt, not a dashboard of zeroes telling them they have earned nothing. The prompt
 * gates the *action* (`useRequireAuth` opens the login dialog) rather than redirecting, per DoD §3:
 * the URL stays put and signing in leaves them here.
 *
 * There is no **not-owner** state, unlike the earnings report: this screen's URL names nobody, so
 * there is no slug to compare a reader against. Being signed in is the whole gate.
 *
 * The two data regions — the metric panel and the top-earning list — hold their **own** loading and
 * error states, because they are two requests and either can fail alone. One error block for both
 * would take a working chart off the screen because a list of five posts 502'd, which is legacy's
 * behaviour and is the wrong trade on a screen whose reason for existing is the chart.
 *
 * ## The bar never unmounts
 *
 * Once the range is resolved, the period control and the range summary stay on screen through every
 * refetch — only the region below them swaps to a skeleton. A control that disappears while the
 * thing it controls reloads makes a period press feel like a page navigation, and it loses the
 * keyboard focus that was on the segment the reader just pressed.
 *
 * ## An empty period is not an empty account
 *
 * `channel/stats/` answering with no metrics for *this window* is a legitimate answer — a creator who
 * did not stream last week — so the empty state says "try another range" rather than "you have
 * earned nothing", and the controls above it stay usable. That is also why the empty state is inside
 * the panel rather than replacing the screen.
 */
export function DashboardAnalyticsView({ className }: { className?: string }) {
    const { t } = useTranslation()
    const requireAuth = useRequireAuth()
    const analytics = useDashboardAnalytics()
    const {
        access,
        range,
        metrics,
        selectedIndex,
        compare,
        topEarning,
        isStatsLoading,
        isStatsError,
        isStatsEmpty,
        isTopEarningLoading,
        isTopEarningError,
    } = analytics

    if (access === 'signed-out') {
        return (
            <div className={cn('flex flex-1 flex-col', className)}>
                <ChannelEmptyState
                    className={cn('flex-1', RISE)}
                    icon="chart-column-alt"
                    title={t('analytics_signed_out_title')}
                    body={t('analytics_signed_out_body')}
                    action={
                        /*
                         * The action *is* the gate: `useRequireAuth` opens the login dialog when
                         * there is no real account, and by the time the callback could run there is
                         * nothing left to do — `access` stops being `'signed-out'` and this branch
                         * unmounts. Same shape as the earnings report's prompt.
                         */
                        <Button
                            data-testid="analytics-sign-in"
                            variant="primary"
                            size="large"
                            onClick={requireAuth(() => undefined)}
                        >
                            {t('auth_sign_in')}
                        </Button>
                    }
                />
            </div>
        )
    }

    // No range yet means the client has not resolved one — see `useDashboardAnalytics` on why that
    // deliberately cannot happen on the server. There is nothing honest to draw but the shape.
    if (range === null) {
        return (
            <div className={cn('flex flex-col', className)}>
                <AnalyticsSkeleton />
            </div>
        )
    }

    const selected = selectedIndex >= 0 ? metrics[selectedIndex] : undefined

    return (
        <div className={cn('flex flex-col gap-4', className)}>
            <PeriodBar
                period={analytics.period}
                range={range}
                compare={compare}
                onSelectPeriod={analytics.selectPeriod}
                onApplyCustomRange={analytics.applyCustomRange}
                onCompareChange={analytics.setCompare}
            />

            <RangeSummary range={range} compare={compare} />

            {isStatsLoading ? (
                <MetricPanelSkeleton />
            ) : isStatsError ? (
                <Panel>
                    <ChannelEmptyState
                        className={RISE}
                        icon="exclamation-diamond"
                        tone="error"
                        title={t('analytics_error_title')}
                        body={t('analytics_error_body')}
                        action={
                            <Button
                                data-testid="analytics-stats-retry"
                                variant="secondary"
                                size="large"
                                onClick={analytics.refetchStats}
                            >
                                {t('common_retry')}
                            </Button>
                        }
                    />
                </Panel>
            ) : isStatsEmpty || !selected ? (
                <Panel>
                    <ChannelEmptyState
                        className={RISE}
                        icon="chart-column-alt"
                        title={t('analytics_empty_title')}
                        body={t('analytics_empty_body')}
                    />
                </Panel>
            ) : (
                /*
                 * `RISE` on the panel, not on the chart: the panel is what *replaced* the skeleton, so
                 * it is the thing that arrived. It plays again on a period change, which is the same
                 * moment — the skeleton goes and figures take its place — and it does **not** play when
                 * switching metric tabs, because the panel stays mounted there and only the plot
                 * inside it is keyed (see `MetricChart`'s own draw animation, which is that moment's
                 * signal).
                 */
                <Panel className={RISE}>
                    <div className="border-b border-(--separator-default) px-4">
                        <MetricTabs
                            metrics={metrics}
                            selectedIndex={selectedIndex}
                            compare={compare}
                            swappable={analytics.swappableMetrics}
                            isConfigLoading={analytics.isMetricConfigLoading}
                            isSwapping={analytics.isSwapping}
                            onSelect={analytics.selectMetric}
                            onOpenSwapMenu={analytics.loadMetricConfig}
                            onSwap={analytics.swapMetric}
                        />
                    </div>
                    {/* Keyed on the metric, so switching tabs remounts the plot rather than
                        animating one metric's line into another's — and so the tooltip's active
                        bucket does not survive onto a series it does not belong to. */}
                    <MetricChart
                        key={selected.id}
                        metric={selected}
                        compare={compare}
                        className="p-4"
                    />
                </Panel>
            )}

            {isTopEarningLoading ? (
                <TopEarningSkeleton />
            ) : isTopEarningError ? (
                <Panel>
                    <ChannelEmptyState
                        className={RISE}
                        icon="exclamation-diamond"
                        tone="error"
                        title={t('analytics_top_earning_error_title')}
                        action={
                            <Button
                                data-testid="analytics-top-earning-retry"
                                variant="secondary"
                                size="large"
                                onClick={analytics.refetchTopEarning}
                            >
                                {t('common_retry')}
                            </Button>
                        }
                    />
                </Panel>
            ) : topEarning.length > 0 ? (
                /*
                 * A beat behind the panel above (`riseDelay(1)` is the app's 60ms step), so the screen
                 * settles top-down instead of both cards appearing as one slab. Its own request is
                 * separate, so it often lands later anyway — the delay makes the *order* deliberate
                 * rather than a race.
                 */
                <TopEarningCard items={topEarning} className={RISE} style={riseDelay(1)} />
            ) : /*
             * Nothing at all when the period earned nothing — no card, no empty state. The
             * chart above has already said the period was quiet, and a second block repeating it
             * is a screen telling the reader off twice. Legacy also renders nothing here.
             */
            null}
        </div>
    )
}

/**
 * The surface a region sits on — the same card the top-earning list wears, so the metric panel, an
 * error block and an empty block are all the same box.
 *
 * `--background-surface`, not `--background-listing`: Listing is `--black` in Dark, the same value as
 * `--background`, so a Listing panel and its border vanish into the page in Dark and only in Dark.
 * `blocked-accounts-view.tsx` documents the same trap at length.
 */
function Panel({ children, className }: { children: React.ReactNode; className?: string }) {
    return (
        <div
            className={cn(
                'flex min-w-0 flex-col rounded-[var(--radius-xl)] border border-(--separator-default) bg-(--background-surface)',
                className,
            )}
        >
            {children}
        </div>
    )
}
