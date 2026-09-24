// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { EventReport } from './use-event-report'
import { useEventReport } from './use-event-report'

/**
 * One claim, and it is the reason this hook returns a union instead of a nullable number.
 *
 * **A failed billing request must never render as `$0`.** `formatRevenue(null)` answers `$0`, which
 * is correct for a *line* inside a bill that arrived and catastrophic for the **headline**: for as
 * long as the request was in flight or failed, the page's largest number told a creator they had
 * earned nothing. That is not something a comment can pin and not something a browser shows you —
 * it looks exactly like a broadcast that made no money.
 *
 * The two queries are also asserted to be **independent**: legacy awaits them in sequence behind one
 * flag, so a 500 from the report service hides a bill that arrived fine.
 */
const getBill = vi.hoisted(() => vi.fn())
const getSummary = vi.hoisted(() => vi.fn())

vi.mock('@features/auth', () => ({ useAuth: () => ({ activeId: 'acc-1' }) }))
vi.mock('../api/event-report-api', async () => {
    const actual =
        await vi.importActual<typeof import('../api/event-report-api')>('../api/event-report-api')
    return { ...actual, eventReportApi: { getBill, getSummary, getOrders: vi.fn() } }
})

function probe() {
    const seen: { current: EventReport | null } = { current: null }
    function Probe() {
        seen.current = useEventReport({ code: 'evt-1' })
        return null
    }
    const client = new QueryClient({
        defaultOptions: { queries: { retry: false, gcTime: 0 } },
    })
    render(
        <QueryClientProvider client={client}>
            <Probe />
        </QueryClientProvider>,
    )
    return seen
}

beforeEach(() => {
    getBill.mockReset()
    getSummary.mockReset()
})

describe('totalState', () => {
    it('is loading before the bill lands — never a figure', () => {
        getBill.mockReturnValue(new Promise(() => {}))
        getSummary.mockReturnValue(new Promise(() => {}))
        const seen = probe()
        expect(seen.current?.totalState).toEqual({ kind: 'loading' })
    })

    /**
     * ⚠ The bug. With a nullable number the caller could not tell this from "earned nothing", and
     * `formatRevenue(null)` printed `$0` over a request that never answered.
     */
    it('is error when the bill fails — never a figure, and never zero', async () => {
        getBill.mockRejectedValue(new Error('500'))
        getSummary.mockResolvedValue(null)
        const seen = probe()
        await waitFor(() => expect(seen.current?.totalState).toEqual({ kind: 'error' }))
        // The nullable number is still `null` on this path, which is exactly why it is not enough.
        expect(seen.current?.total).toBeNull()
    })

    it('is ready with the sum once the bill lands', async () => {
        getBill.mockResolvedValue([
            { category: 'LIVE', net_amount: '10.5', bill_detail: { revenue: [] } },
            { category: 'ACTION', net_amount: '2.25', bill_detail: { revenue: [] } },
        ])
        getSummary.mockResolvedValue(null)
        const seen = probe()
        await waitFor(() =>
            expect(seen.current?.totalState).toEqual({ kind: 'ready', amount: 12.75 }),
        )
    })

    /** A bill that arrived with nothing in it **is** zero — the one case that may say so. */
    it('is ready with null for a bill that arrived empty', async () => {
        getBill.mockResolvedValue([])
        getSummary.mockResolvedValue(null)
        const seen = probe()
        await waitFor(() =>
            expect(seen.current?.totalState).toEqual({ kind: 'ready', amount: null }),
        )
    })
})

describe('the two queries are independent', () => {
    /**
     * Legacy's `useCreator` awaits them in order behind a single `isLoading`, so a failure of the
     * second leaves the first one's data unrendered.
     */
    it('keeps the bill when the summary fails', async () => {
        getBill.mockResolvedValue([
            { category: 'LIVE', net_amount: '10', bill_detail: { revenue: [] } },
        ])
        getSummary.mockRejectedValue(new Error('500'))
        const seen = probe()
        await waitFor(() => expect(seen.current?.isSummaryError).toBe(true))
        expect(seen.current?.isBillError).toBe(false)
        expect(seen.current?.totalState).toEqual({ kind: 'ready', amount: 10 })
        expect(seen.current?.summary).toBeNull()
    })

    it('keeps the summary when the bill fails', async () => {
        getBill.mockRejectedValue(new Error('500'))
        getSummary.mockResolvedValue({ peak_ccu: 12 })
        const seen = probe()
        await waitFor(() => expect(seen.current?.isBillError).toBe(true))
        expect(seen.current?.summary?.peak_ccu).toBe(12)
        expect(seen.current?.isSummaryError).toBe(false)
    })
})
