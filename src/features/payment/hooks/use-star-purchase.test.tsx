// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { StarPackage } from '../api/types'
import { type CheckoutState, IDLE } from '../lib/checkout-machine'
import { useStarPurchase } from './use-star-purchase'

/**
 * What no comment can pin about this hook: **which package it lands on**, and **when it gets out of
 * the way**. Both are decisions made against data that arrives after the sheet opens.
 */

const getStarPackages = vi.hoisted(() => vi.fn())
const getGateways = vi.hoisted(() => vi.fn())

vi.mock('../api/catalog-api', () => ({
    catalogApi: { getStarPackages, getGateways },
}))

const pkg = (id: string, amount: number, bonus = 0): StarPackage =>
    ({ id, amount, bonus_amount: bonus, price: amount / 100 }) as StarPackage

const PACKAGES = [pkg('a', 100), pkg('b', 500), pkg('c', 900, 100), pkg('d', 5000)]
const GATEWAYS = [
    {
        id: 'gw.coda',
        name: 'Coda',
        images: [],
        fee_percent_rate: 0,
        fee_flat_amount: 0,
        currency: null,
    },
    {
        id: 'gw.stripe',
        name: 'Card',
        images: [],
        fee_percent_rate: 2.9,
        fee_flat_amount: 0.3,
        currency: { id: '$', usd_conversion_rate: 1, min_unit: 0.01 },
    },
]

function renderFlow(state: CheckoutState = IDLE) {
    const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false } },
    })
    let api!: ReturnType<typeof useStarPurchase>
    let current = state
    function Probe() {
        api = useStarPurchase(current)
        return null
    }
    const tree = () => (
        <QueryClientProvider client={queryClient}>
            <Probe />
        </QueryClientProvider>
    )
    const utils = render(tree())
    return {
        get: () => api,
        /** A new element each time — React bails out of an identical one. */
        setState: (next: CheckoutState) => {
            current = next
            return act(() => utils.rerender(tree()))
        },
    }
}

beforeEach(() => {
    getStarPackages.mockReset().mockResolvedValue(PACKAGES)
    getGateways.mockReset().mockResolvedValue(GATEWAYS)
})

describe('useStarPurchase', () => {
    it('asks for nothing until it is opened', async () => {
        const flow = renderFlow()
        await Promise.resolve()
        expect(getStarPackages).not.toHaveBeenCalled()
        expect(getGateways).not.toHaveBeenCalled()
        expect(flow.get().step).toBe('closed')
    })

    it('lands on the cheapest package that covers the shortfall, bonus included', async () => {
        const flow = renderFlow()
        await act(async () => flow.get().open(1000))

        // 900 + 100 bonus covers 1,000 — selecting on `amount` alone would jump to the 5,000 tile.
        await waitFor(() => expect(flow.get().selected?.id).toBe('c'))
        expect(flow.get().step).toBe('packages')
        expect(flow.get().shortfall).toBe(1000)
    })

    it('opened deliberately, starts on the recommended tile', async () => {
        const flow = renderFlow()
        await act(async () => flow.get().open())

        await waitFor(() => expect(flow.get().selected?.id).toBe('a'))
        expect(flow.get().shortfall).toBe(0)
    })

    it('does not overwrite a choice the reader made while the catalogue was still loading', async () => {
        const flow = renderFlow()
        await act(async () => flow.get().open(1000))
        await waitFor(() => expect(flow.get().selected?.id).toBe('c'))

        await act(async () => flow.get().select(pkg('d', 5000)))
        expect(flow.get().selected?.id).toBe('d')

        // A re-render with the same catalogue must not re-seed — the seed is once per open.
        await act(async () => flow.get().review())
        expect(flow.get().selected?.id).toBe('d')
    })

    it('prefers the card gateway, because it is the one every country has', async () => {
        const flow = renderFlow()
        await act(async () => flow.get().open())
        await waitFor(() => expect(flow.get().gateway?.id).toBe('gw.stripe'))
    })

    it('prices the order through the chosen gateway', async () => {
        const flow = renderFlow()
        await act(async () => flow.get().open())
        await waitFor(() => expect(flow.get().gateway).not.toBeNull())
        await act(async () => flow.get().select(pkg('e', 999)))

        // 9.99 + 2.9% + 0.30
        expect(flow.get().charge).toMatchObject({ amount: 10.58, currencyId: '$' })
    })

    it('steps aside once the machine has moved past the steps it drives', async () => {
        const flow = renderFlow()
        await act(async () => flow.get().open())
        await waitFor(() => expect(flow.get().selected).not.toBeNull())
        await act(async () => flow.get().pay())
        expect(flow.get().step).toBe('payment')

        // `confirming` is the status dialog's — two layers of chrome would be stacked otherwise.
        await flow.setState({
            kind: 'confirming',
            order: { kind: 'stars', gatewayId: 'gw.stripe', quantity: 100 },
            clientSecret: 'pi_1',
        })
        expect(flow.get().step).toBe('closed')
    })

    it("hands the card step over — that dialog is the provider's, for every order kind", async () => {
        const flow = renderFlow()
        await act(async () => flow.get().open())
        await waitFor(() => expect(flow.get().selected).not.toBeNull())
        await act(async () => flow.get().pay())

        await flow.setState({
            kind: 'card',
            order: { kind: 'stars', gatewayId: 'gw.stripe', quantity: 100 },
            clientSecret: 'pi_1',
        })
        expect(flow.get().step).toBe('closed')
    })

    it('stays open while the browser is being handed to a gateway', async () => {
        const flow = renderFlow()
        await act(async () => flow.get().open())
        await waitFor(() => expect(flow.get().selected).not.toBeNull())
        await act(async () => flow.get().pay())

        /*
         * `leaving` has no dialog of its own, so closing here would leave a blank screen while the
         * navigation happens. The sheet keeps its "taking you to …" line until the page goes.
         */
        await flow.setState({
            kind: 'leaving',
            order: { kind: 'stars', gatewayId: 'gw.coda', quantity: 100 },
            url: 'https://pay.example/x',
        })
        expect(flow.get().step).toBe('payment')
    })

    it('an empty catalogue is an answer, not a failure', async () => {
        getStarPackages.mockResolvedValue([])
        const flow = renderFlow()
        await act(async () => flow.get().open())

        await waitFor(() => expect(flow.get().isEmpty).toBe(true))
        expect(flow.get().isError).toBe(false)
    })
})
