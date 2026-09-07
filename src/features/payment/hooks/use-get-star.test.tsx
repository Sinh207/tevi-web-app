// @vitest-environment jsdom
import { eventBus } from '@shared/lib/event-bus'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Gateway, StarPackage } from '../api/types'
import { useGetStar } from './use-get-star'

/**
 * What no comment can pin about `/get-star`: **what the press sends**, **who is allowed to press**,
 * and **what `?need=` does to the URL after it has been read**. All three are decided against data
 * and a location that arrive after the first render.
 */

const getStarPackages = vi.hoisted(() => vi.fn())
const getGateways = vi.hoisted(() => vi.fn())
vi.mock('../api/catalog-api', () => ({
    catalogApi: { getStarPackages, getGateways },
}))

const payment = vi.hoisted(() => ({
    checkout: vi.fn(),
    isBusy: false,
    state: { kind: 'idle' } as { kind: string },
}))
vi.mock('../providers/payment-provider', () => ({ usePayment: () => payment }))

const session = vi.hoisted(() => ({ isAuthenticated: true, openLoginDialog: vi.fn() }))
/** The real wrapper's shape, so the test pins that `pay` goes *through* the gate rather than around. */
vi.mock('@features/auth', () => ({
    useRequireAuth:
        () =>
        <A extends unknown[]>(cb: (...args: A) => void) =>
        (...args: A) => {
            if (!session.isAuthenticated) {
                session.openLoginDialog()
                return
            }
            cb(...args)
        },
}))

const replace = vi.hoisted(() => vi.fn())
vi.mock('next/navigation', () => ({
    usePathname: () => '/get-star',
    useRouter: () => ({ replace }),
}))

const pkg = (id: string, amount: number, bonus = 0): StarPackage =>
    ({ id, amount, bonus_amount: bonus, price: amount / 100 }) as StarPackage

const PACKAGES = [pkg('a', 100), pkg('b', 500), pkg('c', 900, 100), pkg('d', 5000)]

const gateway = (id: string, overrides: Partial<Gateway> = {}): Gateway =>
    ({
        id,
        name: id,
        images: [],
        fee_percent_rate: 0,
        fee_flat_amount: 0,
        currency: null,
        min_payment_amount: 0,
        max_payment_amount: null,
        ...overrides,
    }) as Gateway

const GATEWAYS = [gateway('gw.momo'), gateway('gw.stripe', { name: 'Card' })]

function renderFlow() {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    let api!: ReturnType<typeof useGetStar>
    function Probe() {
        api = useGetStar()
        return null
    }
    render(
        <QueryClientProvider client={queryClient}>
            <Probe />
        </QueryClientProvider>,
    )
    return { get: () => api }
}

function at(search: string) {
    window.history.replaceState({}, '', `/get-star${search}`)
}

beforeEach(() => {
    getStarPackages.mockReset().mockResolvedValue(PACKAGES)
    getGateways.mockReset().mockResolvedValue(GATEWAYS)
    payment.checkout.mockReset()
    payment.isBusy = false
    payment.state = { kind: 'idle' }
    session.isAuthenticated = true
    session.openLoginDialog.mockReset()
    replace.mockReset()
    at('')
})

describe('useGetStar', () => {
    it('asks for the catalogue immediately — the page is the catalogue', async () => {
        const flow = renderFlow()
        await waitFor(() => expect(flow.get().packages).toHaveLength(4))
        expect(getGateways).toHaveBeenCalled()
    })

    it('opened deliberately, starts on the recommended tile and the card gateway', async () => {
        const flow = renderFlow()
        await waitFor(() => expect(flow.get().selected?.id).toBe('a'))
        // Not `gw.momo`, which is first in the list: card is the one method every country has.
        expect(flow.get().gateway?.id).toBe('gw.stripe')
        expect(flow.get().shortfall).toBe(0)
    })

    it('lands `?need=` on the cheapest package that covers it, bonus included', async () => {
        at('?need=1000')
        const flow = renderFlow()
        // 900 + 100 bonus covers 1,000 — selecting on `amount` alone would jump to the 5,000 tile.
        await waitFor(() => expect(flow.get().selected?.id).toBe('c'))
        expect(flow.get().shortfall).toBe(1000)
    })

    it('sweeps `?need=` once it has been read, keeping the parameters that are not ours', async () => {
        at('?need=1000&ref=push')
        const flow = renderFlow()
        await waitFor(() =>
            expect(replace).toHaveBeenCalledWith('/get-star?ref=push', {
                scroll: false,
            }),
        )
        // A reload after a purchase must not re-apply a gap that no longer exists.
        expect(flow.get().shortfall).toBe(1000)
    })

    it('ignores a `need` that is not a positive number, and leaves the URL alone', async () => {
        at('?need=-5')
        const flow = renderFlow()
        await waitFor(() => expect(flow.get().selected?.id).toBe('a'))
        expect(flow.get().shortfall).toBe(0)
        expect(replace).not.toHaveBeenCalled()
    })

    it('sends the Star count, not the bonused figure, and the chosen gateway', async () => {
        const flow = renderFlow()
        await waitFor(() => expect(flow.get().selected?.id).toBe('a'))
        act(() => flow.get().select(PACKAGES[2] as StarPackage))
        act(() => flow.get().pay())

        // `amount`, never `packageStars`: the bonus is the backend's to add (B63).
        expect(payment.checkout).toHaveBeenCalledWith({
            kind: 'stars',
            gatewayId: 'gw.stripe',
            quantity: 900,
        })
    })

    it('a guest gets the login dialog and no order is built', async () => {
        session.isAuthenticated = false
        const flow = renderFlow()
        await waitFor(() => expect(flow.get().selected?.id).toBe('a'))

        // The button is **not** disabled for a guest — the press is the gate.
        expect(flow.get().canPay).toBe(true)
        act(() => flow.get().pay())
        expect(session.openLoginDialog).toHaveBeenCalledTimes(1)
        expect(payment.checkout).not.toHaveBeenCalled()
    })

    it('refuses a package the gateway will not take, and says so through `isAccepted`', async () => {
        getGateways.mockResolvedValue([gateway('gw.stripe', { min_payment_amount: 5 })])
        const flow = renderFlow()
        await waitFor(() => expect(flow.get().gateway?.id).toBe('gw.stripe'))
        // The $1.00 tile is under the gateway's declared floor.
        expect(flow.get().isAccepted).toBe(false)
        expect(flow.get().canPay).toBe(false)

        act(() => flow.get().select(PACKAGES[3] as StarPackage))
        await waitFor(() => expect(flow.get().isAccepted).toBe(true))
        expect(flow.get().canPay).toBe(true)
    })

    it('will not start a second checkout while the machine is working', async () => {
        payment.isBusy = true
        const flow = renderFlow()
        await waitFor(() => expect(flow.get().selected?.id).toBe('a'))
        expect(flow.get().canPay).toBe(false)
        act(() => flow.get().pay())
        expect(payment.checkout).not.toHaveBeenCalled()
    })

    /**
     * The stale hint. Somebody arrives on `?need=1000`, buys it, presses Done — and the page they land
     * back on used to still read "You need 1,000 more Star" over a balance that now covered it.
     *
     * Driven through the bus rather than through the machine, because that is the path that actually
     * has to work: a settle can land with the dialog already closed and the machine back at `idle`,
     * so there is no `succeeded` render for the page to observe.
     */
    it('stops naming the gap once a Star purchase has settled', async () => {
        at('?need=1000')
        const flow = renderFlow()
        await waitFor(() => expect(flow.get().shortfall).toBe(1000))

        act(() => {
            eventBus.emit('payment:succeeded', { purchaseType: null })
        })
        expect(flow.get().shortfall).toBe(0)
    })

    it('leaves the gap alone when what settled was not Star', async () => {
        at('?need=1000')
        const flow = renderFlow()
        await waitFor(() => expect(flow.get().shortfall).toBe(1000))

        // A membership renewal settling in the background says nothing about this reader's Star gap.
        act(() => {
            eventBus.emit('payment:succeeded', { purchaseType: 'subscription' })
        })
        expect(flow.get().shortfall).toBe(1000)
    })

    it('reports the hand-off, so the page can say where the browser is going', async () => {
        payment.state = { kind: 'leaving' }
        const flow = renderFlow()
        await waitFor(() => expect(flow.get().selected?.id).toBe('a'))
        expect(flow.get().isLeaving).toBe(true)
    })

    it('prints the total through the gateway, and an em dash before anything is chosen', async () => {
        getStarPackages.mockResolvedValue([])
        const flow = renderFlow()
        await waitFor(() => expect(flow.get().isEmpty).toBe(true))
        expect(flow.get().amountLabel).toBe('—')
    })
})
