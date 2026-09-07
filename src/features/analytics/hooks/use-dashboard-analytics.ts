'use client'

import { useAuth } from '@features/auth'
import { useTranslation } from '@shared/i18n/use-translation'
import { keepFor } from '@shared/lib/api/query-client'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useRef, useState } from 'react'
import { analyticsApi, analyticsKeys } from '../api/analytics-api'
import type { ChannelStatMetric, MetricOption, TopEarningItem } from '../api/types'
import {
    customRange,
    type DateRange,
    DEFAULT_PERIOD,
    hourIntervalFor,
    type PeriodId,
    parseRangeParams,
    resolvePeriodRange,
} from '../lib/periods'

/**
 * Who may see the dashboard, and whether we know yet.
 *
 * A tri-state for the reason `useEarningsReport`'s is: the session bootstrap has to land before
 * "is there an account?" has an answer, and every guess in that window is visible. Default to
 * `'signed-out'` and a creator opening their own dashboard is asked to sign in, for a beat, on every
 * load; default to `'allowed'` and four requests fire for a session that turns out to be anonymous.
 *
 * There is **no `'not-owner'`** here, unlike the earnings report. That state exists there because
 * the URL names a channel the request ignores; this screen's URL names nobody, so being signed in is
 * the whole gate.
 */
export type AnalyticsAccess = 'unknown' | 'allowed' | 'signed-out'

export interface UseDashboardAnalyticsResult {
    access: AnalyticsAccess
    /** `null` until the range has been resolved on the client — see the note on mounting below. */
    range: DateRange | null
    period: PeriodId
    hourInterval: number
    compare: boolean
    metrics: ChannelStatMetric[]
    /** Always a valid index into `metrics`, or `-1` when there are none. */
    selectedIndex: number
    topEarning: TopEarningItem[]
    /** The metrics a slot may be switched to — the catalogue minus the ones already on screen. */
    swappableMetrics: MetricOption[]
    isMetricConfigLoading: boolean
    isStatsLoading: boolean
    isStatsError: boolean
    isStatsEmpty: boolean
    isTopEarningLoading: boolean
    isTopEarningError: boolean
    selectPeriod: (period: PeriodId) => void
    applyCustomRange: (from: Date, to: Date) => void
    setCompare: (compare: boolean) => void
    selectMetric: (index: number) => void
    /** Loads the swap menu's data. Called when a menu is first opened, never on page load. */
    loadMetricConfig: () => void
    /** Put a metric in a tab slot. Resolves when the tabs have been refetched. */
    swapMetric: (position: number, metricId: string) => void
    isSwapping: boolean
    refetchStats: () => void
    refetchTopEarning: () => void
}

/**
 * The dashboard's state and its four requests.
 *
 * ## Nothing here reads the clock before the browser does
 *
 * `range` starts as `null` and is resolved in an effect, so no part of this hook runs during SSR.
 * That is not caution about hooks — it is the only correct answer to a **local** range (see
 * `lib/periods.ts`): the server's zone is not the reader's, so a range resolved there would be a
 * different 30 days, and the caption under it would disagree with the request that was sent. The
 * view renders its skeleton until `range` exists, which is honest — it does not yet know what
 * period it is showing.
 *
 * It also removes a whole class of hydration mismatch: every date on this screen is formatted in the
 * reader's zone, and none of it is rendered until there is a browser to have a zone.
 *
 * ## The deep link is read once and then swept up
 *
 * `?start_date_ts=…&end_date_ts=…` is how the mobile app opens this screen on a specific window.
 * It is read from `window.location` rather than `useSearchParams` on purpose: `useSearchParams`
 * makes the tree require a Suspense boundary at build time and would be read during the prerender,
 * which is exactly the SSR path this hook avoids. The params are then stripped with
 * `history.replaceState` — no Next navigation, no re-render, no refetch — so that changing the
 * period afterwards does not leave a URL claiming a range the screen is no longer showing. Legacy
 * does the same with `router.replace(..., { shallow: true })`.
 */
export function useDashboardAnalytics(): UseDashboardAnalyticsResult {
    const { activeId, isAuthenticated, isBootstrapping } = useAuth()
    const queryClient = useQueryClient()
    const { t } = useTranslation()

    const [period, setPeriod] = useState<PeriodId>(DEFAULT_PERIOD)
    const [range, setRange] = useState<DateRange | null>(null)
    const [compare, setCompare] = useState(true)
    const [requestedIndex, setRequestedIndex] = useState(0)
    /*
     * The swap menu's two requests are **not** made on page load. Legacy fires both every time the
     * screen opens, for a menu most readers never open — and one of them (`config/metrics/`) is a
     * catalogue that changes when the backoffice changes, which is to say almost never. They are
     * fetched when a menu is first opened and then cached for the rest of the session.
     */
    const [metricConfigWanted, setMetricConfigWanted] = useState(false)

    /**
     * Ran-once latch, and it is not belt-and-braces: this effect **strips the parameters it read**, so
     * StrictMode's second mount in development finds a params-free URL and falls through to the
     * default 30-day range — silently discarding the deep link the mobile app just followed, in
     * exactly the environment the deep link gets tested in (`next.config.ts` sets
     * `reactStrictMode: true`). Production runs the effect once and was unaffected, which is why the
     * existing test passes: it renders without StrictMode.
     */
    const resolvedRange = useRef(false)

    useEffect(() => {
        if (resolvedRange.current) return
        resolvedRange.current = true
        const params = new URLSearchParams(window.location.search)
        const deepLinked = parseRangeParams(
            params.get('start_date_ts'),
            params.get('end_date_ts'),
            new Date(),
        )
        if (deepLinked) {
            setRange(deepLinked)
            setPeriod('custom')
            params.delete('start_date_ts')
            params.delete('end_date_ts')
            const query = params.toString()
            window.history.replaceState(
                window.history.state,
                '',
                `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`,
            )
            return
        }
        setRange(resolvePeriodRange(DEFAULT_PERIOD, new Date()))
    }, [])

    const access: AnalyticsAccess = isBootstrapping
        ? 'unknown'
        : isAuthenticated
          ? 'allowed'
          : 'signed-out'

    const hourInterval = range ? hourIntervalFor(range) : 24
    const canQuery = access === 'allowed' && range !== null

    const statsQuery = useQuery({
        // `range!` is safe under `canQuery`; the key is only built when the query may run.
        queryKey: analyticsKeys.stats(activeId, range ?? { startMs: 0, endMs: 0 }, hourInterval),
        queryFn: ({ signal }) =>
            analyticsApi.getChannelStats({
                range: range as DateRange,
                hourInterval,
                accountId: activeId,
                signal,
            }),
        enabled: canQuery,
    })

    const topEarningQuery = useQuery({
        queryKey: analyticsKeys.topEarning(activeId, range ?? { startMs: 0, endMs: 0 }),
        queryFn: ({ signal }) =>
            analyticsApi.getTopEarningContent({
                range: range as DateRange,
                accountId: activeId,
                signal,
            }),
        enabled: canQuery,
    })

    const catalogueQuery = useQuery({
        queryKey: analyticsKeys.metricCatalogue(activeId),
        queryFn: ({ signal }) => analyticsApi.getMetricCatalogue({ accountId: activeId, signal }),
        enabled: access === 'allowed' && metricConfigWanted,
        // The catalogue is backoffice configuration, not the account's data: it is the same answer
        // all session. An hour beats the global 60s, which would re-ask on every menu open.
        ...keepFor(60 * 60 * 1000),
    })

    const userMetricsQuery = useQuery({
        queryKey: analyticsKeys.userMetrics(activeId),
        queryFn: ({ signal }) => analyticsApi.getUserMetrics({ accountId: activeId, signal }),
        enabled: access === 'allowed' && metricConfigWanted,
    })

    const metrics = statsQuery.data ?? []
    /*
     * Clamped rather than stored clamped. A swap can shorten the tab strip while the fourth tab is
     * selected, and an index past the end renders an empty chart panel with a selected tab that is
     * not there. Deriving it means the strip can change under the selection without a second effect
     * to keep them in step.
     */
    const selectedIndex = metrics.length === 0 ? -1 : Math.min(requestedIndex, metrics.length - 1)

    /*
     * The swap menu excludes metrics that are already in a slot — including the slot being edited,
     * which is why the *current* tab is not offered either: choosing it would POST a position it
     * already occupies. Legacy filters the same way.
     */
    const chosenIds = new Set((userMetricsQuery.data ?? []).map(option => option.id))
    for (const metric of metrics) chosenIds.add(metric.id)
    const swappableMetrics = (catalogueQuery.data ?? []).filter(option => !chosenIds.has(option.id))

    const swap = useMutation({
        mutationFn: ({ position, metricId }: { position: number; metricId: string }) =>
            analyticsApi.selectMetric({ metricId, position, accountId: activeId }),
        /*
         * No optimistic update. The tab's *figures* come from a different endpoint than the
         * selection does, so an optimistic swap could only paint a tab with a label and no number —
         * and if the write failed, it would have to be un-swapped under the reader's cursor. The
         * honest version is: the request lands, both lists are refetched, and the tab appears
         * complete.
         *
         * `activeId` is captured in the closure at press time and passed explicitly, so a swap
         * initiated on one account cannot land on another mid-flight — the same rule the reads follow.
         */
        onSuccess: () =>
            Promise.all([
                queryClient.invalidateQueries({ queryKey: analyticsKeys.userMetrics(activeId) }),
                // Every range is invalidated, not just the one on screen: the cached 7d/90d answers
                // are lists of the *old* metric set, and serving one on the next period press would
                // show a strip that disagrees with the one being looked at.
                queryClient.invalidateQueries({
                    queryKey: ['analytics', 'stats', activeId ?? 'anon'],
                }),
            ]).then(() => undefined),
        /*
         * A translated fallback, not `true`. `true` prints `error.message`, whose chain ends in
         * axios's own English when the body carried no message — see `docs/API_ERRORS.md`. The
         * API's own 4xx sentence still wins over this string; this is what shows when there is none.
         */
        meta: { showErrorToast: t('analytics_metric_swap_failed') },
    })

    const selectPeriod = useCallback((next: PeriodId) => {
        // `custom` has no range of its own — the view opens the picker, and `applyCustomRange` is
        // what actually moves the window. Setting the period here would leave the screen claiming a
        // custom range while still showing the old one.
        if (next === 'custom') return
        setPeriod(next)
        setRange(resolvePeriodRange(next, new Date()))
    }, [])

    const applyCustomRange = useCallback((from: Date, to: Date) => {
        setPeriod('custom')
        setRange(customRange(from, to))
    }, [])

    return {
        access,
        range,
        period,
        hourInterval,
        compare,
        metrics,
        selectedIndex,
        topEarning: topEarningQuery.data ?? [],
        swappableMetrics,
        isMetricConfigLoading: catalogueQuery.isLoading || userMetricsQuery.isLoading,
        /*
         * `isLoading` is false while a query is disabled, which is correct for TanStack and wrong for
         * this screen: `'unknown'` access and an unresolved range are both moments the reader should
         * see a skeleton. Folding them in here keeps the view from having to know that.
         */
        isStatsLoading: !canQuery ? access !== 'signed-out' : statsQuery.isLoading,
        isStatsError: statsQuery.isError,
        isStatsEmpty:
            canQuery && !statsQuery.isLoading && !statsQuery.isError && metrics.length === 0,
        isTopEarningLoading: !canQuery ? access !== 'signed-out' : topEarningQuery.isLoading,
        isTopEarningError: topEarningQuery.isError,
        selectPeriod,
        applyCustomRange,
        setCompare,
        selectMetric: setRequestedIndex,
        loadMetricConfig: useCallback(() => setMetricConfigWanted(true), []),
        swapMetric: useCallback(
            (position: number, metricId: string) => swap.mutate({ position, metricId }),
            [swap],
        ),
        isSwapping: swap.isPending,
        refetchStats: useCallback(() => {
            statsQuery.refetch()
        }, [statsQuery]),
        refetchTopEarning: useCallback(() => {
            topEarningQuery.refetch()
        }, [topEarningQuery]),
    }
}
