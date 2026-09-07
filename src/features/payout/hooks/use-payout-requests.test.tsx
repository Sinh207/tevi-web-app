// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PAYOUT_PAGE_SIZE } from '../api/payout-api'
import type { PayoutRequest } from '../api/types'
import { usePayoutRequests } from './use-payout-requests'

/**
 * What this hook promises that no call site can see:
 *
 * - a request carries the account that was active when it went out;
 * - "is there another page" comes from the payload's `next`, which **this** endpoint does send —
 *   a full page that is the last page is the case a length-based guess gets wrong;
 * - month groups keep the server's order, where legacy's object-keyed bucketing silently reorders;
 * - one empty state, not two — there is no filter here to be empty *because of*.
 */

const getRequests = vi.hoisted(() => vi.fn())

vi.mock('../api/payout-api', async () => {
    const actual = await vi.importActual<typeof import('../api/payout-api')>('../api/payout-api')
    return { ...actual, payoutApi: { ...actual.payoutApi, getRequests } }
})

const auth = vi.hoisted(() => ({
    state: { activeId: 'acc-1' as string | null, isAuthenticated: true, isBootstrapping: false },
}))
vi.mock('@features/auth', () => ({ useAuth: () => auth.state }))

/** Mid-month on purpose: months are bucketed in the reader's zone, so a boundary fixture is flaky. */
const FEB = Date.UTC(2025, 1, 19, 12, 0)
const JAN = Date.UTC(2025, 0, 15, 12, 0)

function request(over: Partial<PayoutRequest> = {}): PayoutRequest {
    return {
        id: 'p-1',
        requestNumber: '10428',
        status: 'pending',
        createdAt: FEB,
        netAmount: 1240.5,
        netAmountCurrency: 'USD',
        ...over,
    }
}

/**
 * A page as the **model** returns it — `{ rows, hasMore }`, not a bare array.
 *
 * `hasMore` comes from the payload's own `next`, so a test asserting pagination has to state it
 * rather than imply it from a full page: `billing/payout-request/` sends `count`/`next`, unlike the
 * two ledger endpoints.
 */
function page(rows: PayoutRequest[], hasMore = false) {
    return { rows, hasMore }
}

function fullPage(prefix: string): PayoutRequest[] {
    return Array.from({ length: PAYOUT_PAGE_SIZE }, (_, index) =>
        request({ id: `${prefix}-${index}` }),
    )
}

function renderHook() {
    const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })
    let api: ReturnType<typeof usePayoutRequests> | undefined
    function Probe() {
        api = usePayoutRequests()
        return null
    }
    render(
        <QueryClientProvider client={queryClient}>
            <Probe />
        </QueryClientProvider>,
    )
    return { read: () => api as ReturnType<typeof usePayoutRequests> }
}

beforeEach(() => {
    vi.clearAllMocks()
    auth.state = { activeId: 'acc-1', isAuthenticated: true, isBootstrapping: false }
    getRequests.mockResolvedValue(page([request()]))
})

describe('the request', () => {
    it('pins the account that was active when it went out', async () => {
        const { read } = renderHook()
        await waitFor(() => expect(read().groups.length).toBe(1))
        expect(getRequests.mock.calls[0][0]).toMatchObject({ accountId: 'acc-1', page: 1 })
    })

    it('is not made at all without a real account', async () => {
        auth.state = { activeId: null, isAuthenticated: false, isBootstrapping: false }
        const { read } = renderHook()
        // Every visitor carries an anonymous session; a guest has no payouts to ask about.
        await waitFor(() => expect(read().isLoading).toBe(false))
        expect(getRequests).not.toHaveBeenCalled()
    })
})

describe('pagination', () => {
    it('takes `hasMore` from the endpoint rather than from the page length', async () => {
        // A **full** page that says there is nothing after it — which is exactly the case a
        // length-based guess gets wrong, and the reason the ledgers pay for one extra request.
        getRequests.mockResolvedValueOnce(page(fullPage('a'), false))
        const { read } = renderHook()
        await waitFor(() => expect(read().groups.length).toBeGreaterThan(0))
        expect(read().hasNextPage).toBe(false)
    })

    it('advances while the endpoint says there is more', async () => {
        getRequests.mockResolvedValueOnce(page(fullPage('a'), true))
        const { read } = renderHook()
        await waitFor(() => expect(read().hasNextPage).toBe(true))

        getRequests.mockResolvedValueOnce(page([request({ id: 'b-0' })], false))
        await act(async () => {
            read().fetchNextPage()
        })
        await waitFor(() => expect(read().hasNextPage).toBe(false))
        expect(getRequests.mock.calls[1][0].page).toBe(2)
    })

    it('ignores a fetchNextPage while one is already in flight', async () => {
        getRequests.mockResolvedValue(page(fullPage('a'), true))
        const { read } = renderHook()
        await waitFor(() => expect(read().hasNextPage).toBe(true))
        /*
         * Three calls in one tick, which is what an intersection observer does for a single crossing.
         * `isFetchingNextPage` is last render's value and is still `false` for all three — the
         * synchronous latch is what makes this two requests rather than four. The ledger hook shipped
         * without it and did exactly that.
         */
        await act(async () => {
            read().fetchNextPage()
            read().fetchNextPage()
            read().fetchNextPage()
        })
        await waitFor(() => expect(getRequests).toHaveBeenCalledTimes(2))
    })
})

describe('month grouping', () => {
    it('keeps the server order rather than bucketing by month', async () => {
        /*
         * February, January, then February again — which legacy's object keyed on `MMMM, yyyy` merges
         * back into the first February group, reordering a list of money.
         */
        getRequests.mockResolvedValue(
            page([
                request({ id: '1', createdAt: FEB }),
                request({ id: '2', createdAt: JAN }),
                request({ id: '3', createdAt: FEB }),
            ]),
        )
        const { read } = renderHook()
        await waitFor(() => expect(read().groups.length).toBe(3))

        const groups = read().groups
        expect(groups.map(group => group.rows.map(row => row.id))).toEqual([['1'], ['2'], ['3']])
        expect(groups[0].key).toBe(groups[2].key)
    })
})

describe('the empty state', () => {
    it('reports empty only once settled', async () => {
        let resolve: (value: { rows: PayoutRequest[]; hasMore: boolean }) => void = () => {}
        getRequests.mockReturnValue(
            new Promise<{ rows: PayoutRequest[]; hasMore: boolean }>(next => (resolve = next)),
        )
        const { read } = renderHook()
        expect(read().isLoading).toBe(true)
        // Claiming "no payouts" while the first page is in flight is a claim about somebody's money.
        expect(read().isEmpty).toBe(false)

        await act(async () => {
            resolve(page([]))
        })
        await waitFor(() => expect(read().isEmpty).toBe(true))
    })

    it('does not report empty on a failure', async () => {
        getRequests.mockRejectedValue(new Error('502'))
        const { read } = renderHook()
        await waitFor(() => expect(read().isError).toBe(true))
        // "You have no payouts" and "we could not load them" are different sentences, and legacy
        // shows the first for both — its catch sets the list to `[]`.
        expect(read().isEmpty).toBe(false)
    })
})
