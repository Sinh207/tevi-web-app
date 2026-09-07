// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PremiumPackage } from '../api/types'
import { usePremiumPlans } from './use-premium-plans'

/**
 * **The four states, and which of them a *disabled* query reports.**
 *
 * That last one is the whole reason this file exists. The query is gated on `isAuthenticated`, which
 * is `false` for the length of the session bootstrap — a `/me` round trip, and on a cold device a
 * Firebase anonymous sign-in before it. A disabled query reports `isLoading: false` **and** holds no
 * data, so the first version's `isEmpty` (`!isLoading && !isError && length === 0`) was `true` for
 * that entire window and the screen told an arriving visitor *"Premium plans can't be loaded right
 * now"*. It shipped, and it was caught by looking at a screenshot rather than by a test.
 *
 * Nothing about that is visible in the hook's source: every branch reads correctly on its own. It is
 * only wrong in combination with a gate, which is why the claim has to be a test.
 */

const getPackages = vi.hoisted(() => vi.fn())
vi.mock('../api/premium-api', async importOriginal => ({
    ...(await importOriginal<typeof import('../api/premium-api')>()),
    premiumApi: { getPackages },
}))

const auth = vi.hoisted(() => ({ activeId: 'acc-1', isAuthenticated: true }))
vi.mock('@features/auth', () => ({ useAuth: () => auth }))

const pkg = (duration_days: number, price: number): PremiumPackage =>
    ({
        id: String(duration_days),
        product_id: `p${duration_days}`,
        price,
        duration_days,
    }) as PremiumPackage

interface Read {
    plans: ReturnType<typeof usePremiumPlans>['plans']
    savings: number | null
    isLoading: boolean
    isError: boolean
    isEmpty: boolean
}

/** One component that assigns the hook's answer out — the repo's `Probe` idiom. */
function probe() {
    const seen: { current: Read | null } = { current: null }
    function Probe() {
        const { plans, savings, isLoading, isError, isEmpty } = usePremiumPlans()
        seen.current = { plans, savings, isLoading, isError, isEmpty }
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
    getPackages.mockReset()
    auth.isAuthenticated = true
    auth.activeId = 'acc-1'
})

describe('usePremiumPlans', () => {
    it('groups the catalogue and computes the annual discount', async () => {
        getPackages.mockResolvedValue([pkg(7, 4.99), pkg(30, 9.99), pkg(365, 89.99)])
        const seen = probe()

        await waitFor(() => expect(seen.current?.isLoading).toBe(false))
        expect(seen.current?.plans.weekly?.price).toBe(4.99)
        expect(seen.current?.plans.annual?.price).toBe(89.99)
        // 12 × 9.99 = 119.88 against 89.99 → 25%
        expect(seen.current?.savings).toBe(25)
        expect(seen.current?.isEmpty).toBe(false)
    })

    /**
     * The regression. A gate that has not opened yet is **loading**, never empty: the bearer is
     * coming and the prices with it.
     */
    it('reports loading — not empty — while the session is still bootstrapping', () => {
        auth.isAuthenticated = false
        const seen = probe()

        expect(seen.current?.isLoading).toBe(true)
        expect(seen.current?.isEmpty).toBe(false)
        expect(seen.current?.isError).toBe(false)
        expect(getPackages).not.toHaveBeenCalled()
    })

    it('is empty only once the request has settled with nothing to sell', async () => {
        getPackages.mockResolvedValue([])
        const seen = probe()

        await waitFor(() => expect(seen.current?.isEmpty).toBe(true))
        expect(seen.current?.isLoading).toBe(false)
        expect(seen.current?.isError).toBe(false)
    })

    it('reports an error rather than an empty catalogue when the request fails', async () => {
        getPackages.mockRejectedValue(new Error('502'))
        const seen = probe()

        await waitFor(() => expect(seen.current?.isError).toBe(true))
        // The screen offers a retry for this and not for `isEmpty`; conflating them would offer a
        // retry for a request that succeeded, or none for one that did not.
        expect(seen.current?.isEmpty).toBe(false)
        expect(seen.current?.isLoading).toBe(false)
    })

    it('withholds the discount when the catalogue has no monthly plan to compare against', async () => {
        getPackages.mockResolvedValue([pkg(7, 4.99), pkg(365, 89.99)])
        const seen = probe()

        await waitFor(() => expect(seen.current?.isLoading).toBe(false))
        expect(seen.current?.plans.monthly).toBeNull()
        expect(seen.current?.savings).toBeNull()
    })
})
