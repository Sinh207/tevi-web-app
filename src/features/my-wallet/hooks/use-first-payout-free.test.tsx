// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useFirstPayoutFree } from './use-first-payout-free'

/**
 * This hook decides whether the app tells a creator their next withdrawal is free. Telling them so
 * when it is not is the one error on `/my-wallet` that costs them money, so what is pinned here is
 * that it **fails closed** — at every step, not just on the happy path:
 *
 * - a failed request is `false`, not "probably free";
 * - the loading window is `false`, so the banner fades in rather than appearing and being taken away;
 * - a guest never asks, because there is no account to be owed a free payout.
 *
 * The parse itself (`is_free`, plus legacy's `1` / `"true"`) is the model's and is covered where it
 * lives; what this file guards is the *default* around it.
 */

const getFirstPayoutFree = vi.hoisted(() => vi.fn())

vi.mock('../api/wallet-ledger-api', async () => {
    const actual = await vi.importActual<typeof import('../api/wallet-ledger-api')>(
        '../api/wallet-ledger-api',
    )
    return {
        ...actual,
        walletLedgerApi: { ...actual.walletLedgerApi, getFirstPayoutFree },
    }
})

const auth = vi.hoisted(() => ({
    state: { activeId: 'acc-1' as string | null, isAuthenticated: true, isBootstrapping: false },
}))
vi.mock('@features/auth', () => ({ useAuth: () => auth.state }))

function renderHook() {
    const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })
    let value: boolean | undefined
    function Probe() {
        value = useFirstPayoutFree()
        return null
    }
    render(
        <QueryClientProvider client={queryClient}>
            <Probe />
        </QueryClientProvider>,
    )
    return { read: () => value as boolean }
}

beforeEach(() => {
    vi.clearAllMocks()
    auth.state = { activeId: 'acc-1', isAuthenticated: true, isBootstrapping: false }
    getFirstPayoutFree.mockResolvedValue(true)
})

describe('useFirstPayoutFree', () => {
    it('promises nothing until the backend has said so', async () => {
        const { read } = renderHook()
        // The banner is a promise about money: absent while unknown, never optimistic.
        expect(read()).toBe(false)
        await waitFor(() => expect(read()).toBe(true))
    })

    it('fails closed when the request fails', async () => {
        getFirstPayoutFree.mockRejectedValue(new Error('502'))
        const { read } = renderHook()
        await waitFor(() => expect(getFirstPayoutFree).toHaveBeenCalled())
        // A failure is not a denial anywhere else in this app; here it must be, because the cost of
        // being wrong lands on the creator.
        expect(read()).toBe(false)
    })

    it('does not ask on behalf of a guest', async () => {
        auth.state = { activeId: null, isAuthenticated: false, isBootstrapping: false }
        const { read } = renderHook()
        await waitFor(() => expect(read()).toBe(false))
        expect(getFirstPayoutFree).not.toHaveBeenCalled()
    })

    it('pins the account the answer belongs to', async () => {
        renderHook()
        await waitFor(() => expect(getFirstPayoutFree).toHaveBeenCalled())
        // A reader with ten accounts must not be shown one account's free payout under another's key.
        expect(getFirstPayoutFree.mock.calls[0][0]).toMatchObject({ accountId: 'acc-1' })
    })
})
