// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PayoutConfigRow } from '../api/config-types'
import { usePayoutConfigs } from './use-payout-configs'

/**
 * What this hook promises that no call site can see:
 *
 * - the `deleted` rows never reach the screen, and `error` ones **do** — legacy hides both, which is
 *   how a creator ends up with a failing destination and a screen that says nothing;
 * - `isEmpty` counts the *filtered* list, so an account whose only method is deleted reaches the empty
 *   state instead of an empty panel with an Add button in it;
 * - a removal is a **cache edit** pinned to the account the request was made for. That last one is the
 *   race a comment cannot pin: switch accounts while a DELETE is in flight and the naive version drops
 *   a row from somebody else's list.
 */

const getConfigs = vi.hoisted(() => vi.fn())
const deleteConfig = vi.hoisted(() => vi.fn())

vi.mock('../api/payout-api', async () => {
    const actual = await vi.importActual<typeof import('../api/payout-api')>('../api/payout-api')
    return {
        ...actual,
        payoutApi: { ...actual.payoutApi, getConfigs, deleteConfig },
    }
})

const auth = vi.hoisted(() => ({
    state: { activeId: 'acc-1' as string | null, isAuthenticated: true, isBootstrapping: false },
}))
vi.mock('@features/auth', () => ({ useAuth: () => auth.state }))

const toasts = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }))
vi.mock('sonner', () => ({ toast: toasts }))

function row(over: Partial<PayoutConfigRow> = {}): PayoutConfigRow {
    return {
        id: 'pc-1',
        status: 'active',
        createdAt: Date.UTC(2025, 1, 19, 12, 0),
        contactName: 'Ada Lovelace',
        contactEmail: 'ada@tevi.com',
        dailyLimitRemainder: 1000,
        methodName: 'Bank Transfer 24/7',
        methodSlug: 'bank_transfer',
        methodLogo: '',
        methodCurrency: 'VND',
        methodMinimumAmount: null,
        methodExchangeRate: null,
        countryName: 'Viet Nam',
        detail: { account_number: '123' },
        ...over,
    }
}

/** A page as the **model** returns it: the `PagedList` shape `paged-list.ts` speaks. */
function page(results: PayoutConfigRow[], next: string | null = null) {
    return { results, count: results.length, next }
}

function renderHook() {
    const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })
    let api: ReturnType<typeof usePayoutConfigs> | undefined
    function Probe() {
        api = usePayoutConfigs()
        return null
    }
    render(
        <QueryClientProvider client={queryClient}>
            <Probe />
        </QueryClientProvider>,
    )
    return { read: () => api as ReturnType<typeof usePayoutConfigs>, queryClient }
}

beforeEach(() => {
    vi.clearAllMocks()
    auth.state = { activeId: 'acc-1', isAuthenticated: true, isBootstrapping: false }
})

describe('usePayoutConfigs', () => {
    it('sends the active account with the request', async () => {
        getConfigs.mockResolvedValue(page([row()]))
        const { read } = renderHook()

        await waitFor(() => expect(read().methods).toHaveLength(1))
        expect(getConfigs).toHaveBeenCalledWith(
            expect.objectContaining({ accountId: 'acc-1', cursor: null }),
        )
    })

    it('drops deleted methods and keeps the ones in error', async () => {
        getConfigs.mockResolvedValue(
            page([
                row({ id: 'a', status: 'active' }),
                row({ id: 'b', status: 'error' }),
                row({ id: 'c', status: 'deleted' }),
            ]),
        )
        const { read } = renderHook()

        await waitFor(() => expect(read().methods).toHaveLength(2))
        expect(read().methods.map(method => method.id)).toEqual(['a', 'b'])
    })

    it('is empty when every method it was sent is deleted', async () => {
        // Legacy counts the unfiltered list here, so this account gets a panel with no rows in it and
        // never sees the empty state that offers the Add button.
        getConfigs.mockResolvedValue(page([row({ status: 'deleted' })]))
        const { read } = renderHook()

        await waitFor(() => expect(read().isEmpty).toBe(true))
        expect(read().methods).toEqual([])
    })

    it('takes the removed row out of the cached page without refetching', async () => {
        getConfigs.mockResolvedValue(page([row({ id: 'a' }), row({ id: 'b' })]))
        deleteConfig.mockResolvedValue(undefined)
        const { read } = renderHook()

        await waitFor(() => expect(read().methods).toHaveLength(2))
        const fetches = getConfigs.mock.calls.length

        await act(async () => {
            read().remove(read().methods[0])
        })

        await waitFor(() => expect(read().methods.map(method => method.id)).toEqual(['b']))
        expect(deleteConfig).toHaveBeenCalledWith({ id: 'a', accountId: 'acc-1' })
        // The point of `removeListRow`: no second request for a page this client already has.
        expect(getConfigs.mock.calls.length).toBe(fetches)
        expect(toasts.success).toHaveBeenCalled()
    })

    it('removes on the account that was active when it was pressed', async () => {
        getConfigs.mockResolvedValue(page([row({ id: 'a' })]))
        let settle: (() => void) | undefined
        deleteConfig.mockImplementation(
            () =>
                new Promise<void>(resolve => {
                    settle = resolve
                }),
        )
        const { read, queryClient } = renderHook()

        await waitFor(() => expect(read().methods).toHaveLength(1))

        await act(async () => {
            read().remove(read().methods[0])
        })
        // The switch lands *while the DELETE is in flight* — the window the naive version gets wrong.
        auth.state = { activeId: 'acc-2', isAuthenticated: true, isBootstrapping: false }
        await act(async () => {
            settle?.()
        })

        /*
         * `acc-1`'s cached page is the one that loses the row. Read out of the cache rather than off
         * the hook, because after the switch the hook is rendering `acc-2`'s (empty) list — which is
         * exactly why the assertion has to be made here and not on `methods`.
         */
        await waitFor(() => {
            /*
             * **`acc-1`'s key specifically** — `payoutKeys.configs` hangs off `balanceKeys.all`, so it
             * is `['balance', 'payout', 'configs', id]`. Asserting across every config query would
             * pass for the wrong reason: `acc-2` mounted its own list the moment the switch happened,
             * and this fixture answers it with the same row.
             */
            const data = queryClient.getQueryData(['balance', 'payout', 'configs', 'acc-1']) as
                | { pages?: { results: PayoutConfigRow[] }[] }
                | undefined
            const pages = data?.pages ?? []
            expect(pages.length).toBeGreaterThan(0)
            expect(pages.some(entry => entry.results.some(saved => saved.id === 'a'))).toBe(false)
        })
        expect(deleteConfig).toHaveBeenCalledWith({ id: 'a', accountId: 'acc-1' })
    })

    it('does not fire a second removal while one is in flight', async () => {
        getConfigs.mockResolvedValue(page([row({ id: 'a' }), row({ id: 'b' })]))
        deleteConfig.mockImplementation(() => new Promise<void>(() => {}))
        const { read } = renderHook()

        await waitFor(() => expect(read().methods).toHaveLength(2))
        await act(async () => {
            read().remove(read().methods[0])
            read().remove(read().methods[1])
        })

        expect(deleteConfig).toHaveBeenCalledTimes(1)
    })

    it('asks for nothing while the visitor has no account', async () => {
        auth.state = { activeId: null, isAuthenticated: false, isBootstrapping: false }
        const { read } = renderHook()

        await waitFor(() => expect(read().isSignedOut).toBe(true))
        expect(getConfigs).not.toHaveBeenCalled()
    })
})
