// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, waitFor } from '@testing-library/react'
import { act } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { balanceKeys } from '../api/balance-api'
import { BalanceProvider, useBalance } from './balance-provider'

/**
 * What this provider promises that no call site can show:
 *
 * - **the request is pinned to the account it is filed under.** This is money, so a switch mid-flight must
 *   not resolve one person's balance into another person's cache entry;
 * - **an anonymous session costs nothing.** It is mounted above every route, so a query that fired for a
 *   guest would be a wasted round trip on the commonest kind of visit, repeated on every navigation;
 * - **`isKnown` separates "no money" from "no answer".** A zero is a claim about somebody's money and
 *   neither "not asked yet" nor "asked and failed" is that claim — every consumer renders `—` for it, and
 *   the spend gate refuses to decide;
 * - **`hasEnoughStars` fails closed.** Letting a spend through on an unknown balance is a request the
 *   backend has to refuse and a failure the reader cannot explain.
 *
 * The last two are the reason this is a provider rather than a bare `useQuery`: they are product rules, and
 * a rule re-derived at each call site is a rule that will be got wrong at one of them.
 *
 * And one that only shows up across features: **a `balance_change` frame invalidates the ledgers as well
 * as the figure.** `balance-api.ts` states that agreement between the three balance features; the socket
 * handler is the one caller for which getting it wrong is invisible here and visible on `/my-star`.
 */

const getBalance = vi.hoisted(() => vi.fn())

vi.mock('../api/balance-api', async () => {
    const actual = await vi.importActual<typeof import('../api/balance-api')>('../api/balance-api')
    return { ...actual, balanceApi: { ...actual.balanceApi, getBalance } }
})

const authState = {
    activeId: null as string | null,
    isAuthenticated: false,
    isBootstrapping: false,
}

vi.mock('@features/auth', () => ({ useAuth: () => authState }))

/**
 * The realtime room is stubbed so this file stays a unit test — otherwise `useSocketEvent` reaches for
 * the real singleton and pulls `socket.io-client` into every run. The handler is captured instead, which
 * is what lets the test below fire the event.
 */
const socketHandlers = new Map<string, (payload: unknown) => void>()
vi.mock('@features/realtime', () => ({
    useSocketEvent: (event: string, handler: (payload: unknown) => void) => {
        socketHandlers.set(event, handler)
    },
}))

function renderBalance() {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    let api: ReturnType<typeof useBalance> | null = null
    function Probe() {
        api = useBalance()
        return null
    }
    /*
     * Built fresh on each call, **not** hoisted into a constant: React bails out of a re-render when
     * handed a referentially identical element, so reusing one makes `rerender()` a no-op and the
     * account-switch test silently passes against the old account's data.
     */
    const tree = () => (
        <QueryClientProvider client={queryClient}>
            <BalanceProvider>
                <Probe />
            </BalanceProvider>
        </QueryClientProvider>
    )
    const view = render(tree())
    return {
        queryClient,
        read: () => api as ReturnType<typeof useBalance>,
        rerender: () => view.rerender(tree()),
    }
}

beforeEach(() => {
    socketHandlers.clear()
    getBalance.mockReset()
    getBalance.mockResolvedValue({ star: 1284, usd: 4400.03 })
    authState.activeId = null
    authState.isAuthenticated = false
    authState.isBootstrapping = false
})

describe('BalanceProvider', () => {
    it('reports loading while the session is bootstrapping, and asks for nothing', () => {
        authState.isBootstrapping = true

        const { read } = renderBalance()
        // A disabled query is not `isLoading` as far as TanStack is concerned, but this is exactly the
        // moment the shell should show a placeholder rather than a figure.
        expect(read().isLoading).toBe(true)
        expect(read().isKnown).toBe(false)
        expect(read().balance).toBeNull()
        expect(getBalance).not.toHaveBeenCalled()
    })

    /*
     * `isAuthenticated` is already `id && !anonymous` — the app always keeps an anonymous Firebase session,
     * so a present `currentUser` says nothing. A guest has no balance and never will.
     */
    it('asks for nothing for an anonymous or signed-out session', () => {
        const { read } = renderBalance()
        expect(read().isKnown).toBe(false)
        expect(read().isLoading).toBe(false)
        expect(getBalance).not.toHaveBeenCalled()
    })

    it('fetches for a real account and reports the figures', async () => {
        authState.activeId = '1'
        authState.isAuthenticated = true

        const { read } = renderBalance()
        await waitFor(() => expect(read().isKnown).toBe(true))
        expect(read().star).toBe(1284)
        expect(read().usd).toBe(4400.03)
        expect(getBalance).toHaveBeenCalledWith(expect.objectContaining({ accountId: '1' }))
    })

    /*
     * The one that matters most. Legacy's provider holds a single balance and overwrites it with whatever
     * lands, so a switch mid-flight shows account A's figures under account B. Keying on the account means
     * an answer can only ever be filed under the account it was asked for.
     */
    it('files each account answer under its own key', async () => {
        authState.activeId = '1'
        authState.isAuthenticated = true
        getBalance.mockImplementation(({ accountId }: { accountId: string }) =>
            Promise.resolve(accountId === '1' ? { star: 100, usd: 1 } : { star: 999, usd: 99 }),
        )

        const { read, rerender, queryClient } = renderBalance()
        await waitFor(() => expect(read().star).toBe(100))

        authState.activeId = '2'
        await act(async () => {
            rerender()
        })
        await waitFor(() => expect(read().star).toBe(999))

        // Both entries exist and neither has been overwritten by the other.
        expect(queryClient.getQueryData(balanceKeys.balance('1'))).toEqual({ star: 100, usd: 1 })
        expect(queryClient.getQueryData(balanceKeys.balance('2'))).toEqual({ star: 999, usd: 99 })
    })

    /*
     * `isKnown` false and `star` 0 on failure. The zero keeps arithmetic safe; the flag is what stops a
     * creator with 40,000 Star being told they have none.
     */
    it('reports not-known on failure rather than a zero balance', async () => {
        authState.activeId = '1'
        authState.isAuthenticated = true
        getBalance.mockRejectedValue(new Error('gateway'))

        const { read } = renderBalance()
        await waitFor(() => expect(read().isError).toBe(true))
        expect(read().isKnown).toBe(false)
        expect(read().balance).toBeNull()
        expect(read().star).toBe(0)
        expect(read().isLoading).toBe(false)
    })

    describe('hasEnoughStars', () => {
        it('compares against the balance once it is known', async () => {
            authState.activeId = '1'
            authState.isAuthenticated = true
            getBalance.mockResolvedValue({ star: 500, usd: 0 })

            const { read } = renderBalance()
            await waitFor(() => expect(read().isKnown).toBe(true))

            expect(read().hasEnoughStars(499)).toBe(true)
            // Exactly enough is enough.
            expect(read().hasEnoughStars(500)).toBe(true)
            expect(read().hasEnoughStars(501)).toBe(false)
        })

        /*
         * Fails closed, and the direction is the point: offering a top-up to somebody who could have paid
         * is a wasted step, while letting a spend through on an unknown balance is a request the backend
         * has to refuse and a failure the reader cannot explain.
         */
        it('is false while the balance is unknown', () => {
            const { read } = renderBalance()
            expect(read().hasEnoughStars(1)).toBe(false)
            expect(read().hasEnoughStars(0)).toBe(false)
        })

        it('treats a free or nonsensical price as affordable once known', async () => {
            authState.activeId = '1'
            authState.isAuthenticated = true
            getBalance.mockResolvedValue({ star: 0, usd: 0 })

            const { read } = renderBalance()
            await waitFor(() => expect(read().isKnown).toBe(true))

            // A free gift is still a gift; gating it behind a top-up would be absurd.
            expect(read().hasEnoughStars(0)).toBe(true)
            expect(read().hasEnoughStars(-5)).toBe(true)
            // But a real price against a zero balance is not affordable.
            expect(read().hasEnoughStars(1)).toBe(false)
            // And a price that is not a number is never affordable.
            expect(read().hasEnoughStars(Number.NaN)).toBe(false)
        })
    })

    describe('starShortfall', () => {
        it('reports how many Star are missing', async () => {
            authState.activeId = '1'
            authState.isAuthenticated = true
            getBalance.mockResolvedValue({ star: 380, usd: 0 })

            const { read } = renderBalance()
            await waitFor(() => expect(read().isKnown).toBe(true))

            expect(read().starShortfall(500)).toBe(120)
            // Affordable, so nothing is missing.
            expect(read().starShortfall(380)).toBe(0)
            expect(read().starShortfall(100)).toBe(0)
        })

        // Rounded **up**: needing 0.5 more Star means needing one, because Star are whole.
        it('rounds a fractional shortfall up', async () => {
            authState.activeId = '1'
            authState.isAuthenticated = true
            getBalance.mockResolvedValue({ star: 10, usd: 0 })

            const { read } = renderBalance()
            await waitFor(() => expect(read().isKnown).toBe(true))
            expect(read().starShortfall(10.5)).toBe(1)
        })

        /*
         * `0` when unknown as well as when affordable: a shortfall is a figure shown to a person ("you need
         * 120 more"), and inventing one from a balance we do not have would put a made-up number in that
         * sentence. The gate diverts on `hasEnoughStars`, so this is never the reason a spend is blocked.
         */
        it('is zero while the balance is unknown', () => {
            const { read } = renderBalance()
            expect(read().starShortfall(500)).toBe(0)
        })
    })

    /*
     * Mounted at the root, so being outside it means a component was rendered somewhere it cannot work — and
     * a silent zero there would surface much later as "the gift button says I cannot afford it" rather than
     * as the real mistake.
     */
    it('throws when used outside the provider', () => {
        function Bare() {
            useBalance()
            return null
        }
        // React logs the thrown error; silenced so the failure output stays readable.
        const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
        expect(() => render(<Bare />)).toThrow(/BalanceProvider/)
        spy.mockRestore()
    })
})

describe('the realtime balance_change event', () => {
    it('invalidates the ledgers too, not only the figure', async () => {
        authState.activeId = 'acc-1'
        authState.isAuthenticated = true
        const probe = renderBalance()
        await waitFor(() => expect(probe.read().isKnown).toBe(true))

        const invalidate = vi.spyOn(probe.queryClient, 'invalidateQueries')
        const handler = socketHandlers.get('balance_change')
        expect(handler).toBeDefined()
        await act(async () => {
            handler?.({ balances: [] })
        })

        /*
         * `balanceKeys.all`, not `balanceKeys.balance`. Star moved, so the history that explains it is
         * stale as well — a reader on `/my-star` would otherwise see a new total above a transaction
         * list that never mentions why. The narrow key is `refresh()`'s job, for callers that know only
         * the figure changed.
         */
        expect(invalidate).toHaveBeenCalledWith({ queryKey: balanceKeys.all })
    })

    it('does not write the payload into the cache', async () => {
        authState.activeId = 'acc-1'
        authState.isAuthenticated = true
        const probe = renderBalance()
        await waitFor(() => expect(probe.read().isKnown).toBe(true))

        await act(async () => {
            // A frame claiming a different figure. Trusting it would let a socket, which has no
            // ordering guarantee against the responses in flight beside it, move the number backwards.
            socketHandlers.get('balance_change')?.({ star: 1, usd: 1 })
        })

        expect(probe.read().star).toBe(1284)
    })
})
