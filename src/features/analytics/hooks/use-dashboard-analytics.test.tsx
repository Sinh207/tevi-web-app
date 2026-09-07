// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ChannelStatMetric } from '../api/types'
import { useDashboardAnalytics } from './use-dashboard-analytics'

/**
 * What this hook promises that no call site can see, and no comment can pin:
 *
 * - the range is resolved **on the client**, from the reader's own clock, and not before;
 * - a `?start_date_ts` deep link is honoured once and then swept off the URL;
 * - the selected tab survives a strip that gets shorter under it;
 * - the swap menu's two requests are not made until a menu is opened;
 * - a request carries the account that was active when it went out.
 *
 * The last three are races. The first two are the reason nothing on this screen renders during SSR.
 */

const getChannelStats = vi.hoisted(() => vi.fn())
const getTopEarningContent = vi.hoisted(() => vi.fn())
const getMetricCatalogue = vi.hoisted(() => vi.fn())
const getUserMetrics = vi.hoisted(() => vi.fn())
const selectMetric = vi.hoisted(() => vi.fn())

vi.mock('../api/analytics-api', async () => {
    const actual =
        await vi.importActual<typeof import('../api/analytics-api')>('../api/analytics-api')
    return {
        ...actual,
        analyticsApi: {
            getChannelStats,
            getTopEarningContent,
            getMetricCatalogue,
            getUserMetrics,
            selectMetric,
        },
    }
})

const auth = vi.hoisted(() => ({
    state: {
        activeId: 'acc-1' as string | null,
        isAuthenticated: true,
        isBootstrapping: false,
    },
}))

vi.mock('@features/auth', () => ({ useAuth: () => auth.state }))

function metric(id: string, name = 'total_revenue'): ChannelStatMetric {
    return {
        id,
        name,
        description: name,
        display: '$1.00',
        prevDisplay: '$0.50',
        changePercent: 100,
        isInteger: false,
        currencyDisplay: '$',
        hourInterval: 24,
        points: [{ date: 1_739_923_200_000, amount: 1 }],
        prevPoints: [{ date: 1_737_244_800_000, amount: 0.5 }],
    }
}

function renderHook() {
    const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })
    let api: ReturnType<typeof useDashboardAnalytics> | undefined
    function Probe() {
        api = useDashboardAnalytics()
        return null
    }
    render(
        <QueryClientProvider client={queryClient}>
            <Probe />
        </QueryClientProvider>,
    )
    return {
        queryClient,
        read: () => api as ReturnType<typeof useDashboardAnalytics>,
    }
}

beforeEach(() => {
    vi.clearAllMocks()
    auth.state = { activeId: 'acc-1', isAuthenticated: true, isBootstrapping: false }
    getChannelStats.mockResolvedValue([metric('1'), metric('2', 'live_sessions')])
    getTopEarningContent.mockResolvedValue([])
    getMetricCatalogue.mockResolvedValue([{ id: '9', name: 'post_revenue', description: 'Post' }])
    getUserMetrics.mockResolvedValue([])
    selectMetric.mockResolvedValue(undefined)
    window.history.replaceState({}, '', '/dashboard-analytics')
})

describe('the range', () => {
    it('is resolved on the client and covers 30 days ending tonight', async () => {
        const { read } = renderHook()
        await waitFor(() => expect(read().range).not.toBeNull())

        const range = read().range as { startMs: number; endMs: number }
        expect(read().period).toBe('30d')
        // The request is sent with the range it resolved, and with the bucket size that range implies.
        await waitFor(() => expect(getChannelStats).toHaveBeenCalled())
        expect(getChannelStats.mock.calls[0][0]).toMatchObject({
            range,
            hourInterval: 24,
            accountId: 'acc-1',
        })
    })

    it('honours a deep link once, then sweeps the params off the URL', async () => {
        const start = new Date(2025, 1, 10).getTime()
        const end = new Date(2025, 1, 12).getTime()
        window.history.replaceState(
            {},
            '',
            `/dashboard-analytics?start_date_ts=${start}&end_date_ts=${end}&utm=x`,
        )

        const { read } = renderHook()
        await waitFor(() => expect(read().range).not.toBeNull())

        expect(read().period).toBe('custom')
        expect(new Date(read().range?.startMs ?? 0).getDate()).toBe(10)
        // Its own params are gone; anything else on the URL is left alone.
        expect(window.location.search).toBe('?utm=x')
    })

    it('asks nothing at all while the session is still bootstrapping', async () => {
        auth.state = { activeId: null, isAuthenticated: false, isBootstrapping: true }
        const { read } = renderHook()
        await act(async () => {})

        expect(getChannelStats).not.toHaveBeenCalled()
        // And the screen is told to keep showing a skeleton rather than a sign-in prompt.
        expect(read().access).toBe('unknown')
        expect(read().isStatsLoading).toBe(true)
    })

    it('asks nothing for an anonymous visitor, and says so', async () => {
        auth.state = { activeId: 'anon-1', isAuthenticated: false, isBootstrapping: false }
        const { read } = renderHook()
        await act(async () => {})

        expect(getChannelStats).not.toHaveBeenCalled()
        expect(read().access).toBe('signed-out')
        // Not a skeleton: there is nothing coming, so the prompt is the honest answer.
        expect(read().isStatsLoading).toBe(false)
    })
})

describe('the metric strip', () => {
    it('clamps the selection when the strip gets shorter under it', async () => {
        const { read } = renderHook()
        await waitFor(() => expect(read().metrics).toHaveLength(2))

        act(() => read().selectMetric(1))
        expect(read().selectedIndex).toBe(1)

        // A swap can leave fewer metrics than there were. An index past the end renders an empty
        // chart panel under a tab that is not there.
        getChannelStats.mockResolvedValue([metric('1')])
        await act(async () => {
            read().refetchStats()
        })
        await waitFor(() => expect(read().metrics).toHaveLength(1))
        expect(read().selectedIndex).toBe(0)
    })

    it('is -1, not 0, when there are no metrics at all', async () => {
        getChannelStats.mockResolvedValue([])
        const { read } = renderHook()
        await waitFor(() => expect(read().isStatsEmpty).toBe(true))
        expect(read().selectedIndex).toBe(-1)
    })
})

describe('the swap menu', () => {
    it('fetches its two lists when a menu opens, and not on page load', async () => {
        const { read } = renderHook()
        await waitFor(() => expect(getChannelStats).toHaveBeenCalled())

        // Legacy fires both on every visit, for a menu most readers never open.
        expect(getMetricCatalogue).not.toHaveBeenCalled()
        expect(getUserMetrics).not.toHaveBeenCalled()

        act(() => read().loadMetricConfig())
        await waitFor(() => expect(getMetricCatalogue).toHaveBeenCalledTimes(1))
        expect(getUserMetrics).toHaveBeenCalledTimes(1)
    })

    it('offers only metrics that are not already on screen', async () => {
        getMetricCatalogue.mockResolvedValue([
            { id: '1', name: 'total_revenue', description: 'Total' },
            { id: '9', name: 'post_revenue', description: 'Post' },
        ])
        const { read } = renderHook()
        act(() => read().loadMetricConfig())

        // `1` is in a tab already: choosing it would POST a position it already occupies.
        await waitFor(() => expect(read().swappableMetrics.map(o => o.id)).toEqual(['9']))
    })

    it('writes against the account that was active when it was pressed', async () => {
        const { read } = renderHook()
        await waitFor(() => expect(read().metrics).toHaveLength(2))

        await act(async () => {
            read().swapMetric(1, '9')
        })
        await waitFor(() => expect(selectMetric).toHaveBeenCalled())
        expect(selectMetric.mock.calls[0][0]).toEqual({
            metricId: '9',
            position: 1,
            accountId: 'acc-1',
        })
    })
})
