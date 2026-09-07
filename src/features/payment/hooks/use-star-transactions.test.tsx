// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useStarTransactions } from './use-star-transactions'

/**
 * What no comment can pin: **who this asks on behalf of**, and **when it stops asking**. Both are
 * decided against data that arrives after the dialog opens.
 */

const list = vi.hoisted(() => vi.fn())
vi.mock('../api/checkout-api', () => ({
    checkoutApi: { list },
    TRANSACTIONS_PAGE_SIZE: 10,
}))

const auth = vi.hoisted(() => ({ activeId: 'acc-1', isAuthenticated: true }))
vi.mock('@features/auth', () => ({ useAuth: () => auth }))

const page = (n: number, count: number | null) => ({
    rows: Array.from({ length: n }, (_, i) => ({ id: `t${i}` })),
    count,
})

function renderHook({ enabled = true }: { enabled?: boolean } = {}) {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    let api!: ReturnType<typeof useStarTransactions>
    function Probe() {
        api = useStarTransactions({ enabled })
        return null
    }
    render(
        <QueryClientProvider client={queryClient}>
            <Probe />
        </QueryClientProvider>,
    )
    return { get: () => api }
}

beforeEach(() => {
    list.mockReset().mockResolvedValue(page(10, 25))
    auth.activeId = 'acc-1'
    auth.isAuthenticated = true
})

describe('useStarTransactions', () => {
    it('asks for nothing while a caller says it is not needed', async () => {
        renderHook({ enabled: false })
        await Promise.resolve()
        expect(list).not.toHaveBeenCalled()
    })

    /**
     * Every visitor carries an anonymous session, so without this gate each guest reaching
     * `/get-star` would fire an authenticated list request that can only come back empty.
     */
    it('asks for nothing on an anonymous session', async () => {
        auth.isAuthenticated = false
        const hook = renderHook()
        await Promise.resolve()
        expect(list).not.toHaveBeenCalled()
        // And it does not report that as "loading" or as "you have bought nothing".
        expect(hook.get().isLoading).toBe(false)
    })

    it('pins the account the request went out as', async () => {
        const hook = renderHook()
        await waitFor(() => expect(hook.get().rows).toHaveLength(10))
        expect(list).toHaveBeenCalledWith(expect.objectContaining({ page: 1, accountId: 'acc-1' }))
    })

    /**
     * The reason this endpoint is paged differently from the Star ledger: it reports `count`, so the
     * end is **known** rather than inferred from a full last page.
     */
    it('stops on the count, so a full last page does not cost an empty request', async () => {
        list.mockReset().mockResolvedValue(page(10, 10))
        const hook = renderHook()
        await waitFor(() => expect(hook.get().rows).toHaveLength(10))
        expect(hook.get().hasNextPage).toBe(false)
    })

    it('keeps paging while the count says there is more', async () => {
        const hook = renderHook()
        await waitFor(() => expect(hook.get().rows).toHaveLength(10))
        expect(hook.get().hasNextPage).toBe(true)
    })

    it('falls back to the short-page rule when the payload reports no count', async () => {
        list.mockReset().mockResolvedValue(page(4, null))
        const hook = renderHook()
        await waitFor(() => expect(hook.get().rows).toHaveLength(4))
        expect(hook.get().hasNextPage).toBe(false)
    })

    it('an account that has bought nothing is empty, not an error', async () => {
        list.mockReset().mockResolvedValue(page(0, 0))
        const hook = renderHook()
        await waitFor(() => expect(hook.get().isEmpty).toBe(true))
        expect(hook.get().isError).toBe(false)
    })
})
