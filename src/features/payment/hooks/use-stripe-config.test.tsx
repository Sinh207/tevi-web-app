// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useStripeConfig } from './use-stripe-config'

const get = vi.hoisted(() => vi.fn(async () => ({ publishableKey: 'pk_test_1' })))
vi.mock('../api/stripe-config-api', () => ({ stripeConfigApi: { get } }))

/**
 * One question: **when** is the key fetched.
 *
 * `useCheckout` calls this hook, and `useCheckout` lives in `PaymentProvider` — above every route, so
 * that a payment can outlive the surface that started it. Anything it fetches unconditionally is
 * therefore fetched on every page load by every visitor, for a key that only matters at the moment a
 * charge is confirmed. That is what `enabled` is for, and it is the kind of cost that is invisible
 * from the call site.
 */
function probe(enabled: boolean) {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    let key: string | null = null
    function Probe() {
        key = useStripeConfig({ enabled }).publishableKey
        return null
    }
    render(
        <QueryClientProvider client={queryClient}>
            <Probe />
        </QueryClientProvider>,
    )
    return () => key
}

beforeEach(() => {
    get.mockClear()
})

describe('useStripeConfig', () => {
    it('does not ask while nothing is being paid for', async () => {
        const read = probe(false)
        await act(async () => {})

        expect(get).not.toHaveBeenCalled()
        // And it answers `null` rather than pretending: `isUnavailable` is what a screen reads, and a
        // disabled query is not "unavailable", it is "not asked".
        expect(read()).toBeNull()
    })

    it('asks once a checkout is live', async () => {
        const read = probe(true)
        await waitFor(() => expect(read()).toBe('pk_test_1'))

        expect(get).toHaveBeenCalledTimes(1)
    })
})
