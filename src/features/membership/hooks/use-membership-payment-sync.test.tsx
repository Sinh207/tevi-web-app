// @vitest-environment jsdom
import { eventBus } from '@shared/lib/event-bus'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { membershipKeys } from '../api/subscription-api'
import { useMembershipPaymentSync } from './use-membership-payment-sync'

/**
 * The one thing this hook exists for: a **card** membership settles inside `features/payment`, which
 * invalidates the balance and announces on the bus. Without a listener the space's action row keeps
 * offering "Become a member" to somebody who has just paid.
 *
 * Invalidating turned out not to be enough on its own, which is the second thing pinned here. The
 * refetch went out carrying the `If-None-Match` this client still held, the backend answered 304
 * even though the list had changed, and `apiClient` replayed the cached "not a member" (**B72**). So
 * the stored validator has to be dropped — **before** the invalidation, because
 * `invalidateQueries` starts the request straight away and an eviction that lands afterwards drops
 * a record the request already read.
 */
const invalidateETagCache = vi.hoisted(() => vi.fn(async () => {}))

vi.mock('@shared/lib/api/interceptors/etag', () => ({
    ANON_SCOPE: 'anon',
    invalidateETagCache,
}))

vi.mock('@features/auth', () => ({ useAuth: () => ({ activeId: 'acct-1' }) }))

function renderSync() {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')
    function Probe() {
        useMembershipPaymentSync()
        return null
    }
    const view = render(
        <QueryClientProvider client={queryClient}>
            <Probe />
        </QueryClientProvider>,
    )
    invalidate.mockClear()
    return { invalidate, unmount: view.unmount }
}

beforeEach(() => {
    vi.clearAllMocks()
})

describe('useMembershipPaymentSync', () => {
    it('re-reads this feature when a payment settles', async () => {
        const { invalidate } = renderSync()

        act(() => eventBus.emit('payment:succeeded', { purchaseType: 'membership' }))

        await waitFor(() =>
            expect(invalidate).toHaveBeenCalledWith({ queryKey: membershipKeys.mine }),
        )
    })

    it('drops the stored ETag for this account, and does it before the refetch is asked for', async () => {
        const order: string[] = []
        invalidateETagCache.mockImplementation(async () => {
            order.push('etag')
        })
        const { invalidate } = renderSync()
        invalidate.mockImplementation(() => {
            order.push('invalidate')
            return Promise.resolve()
        })

        act(() => eventBus.emit('payment:succeeded', { purchaseType: 'membership' }))

        await waitFor(() => expect(order).toEqual(['etag', 'invalidate']))
        // Scoped to the account that paid, and to every query variant of the list — no params.
        expect(invalidateETagCache).toHaveBeenCalledWith(
            'acct-1',
            expect.stringContaining('/billy/v3/subscription/my-subscriptions/'),
        )
    })

    it('does not filter on `purchaseType` — its closed set is an open question', async () => {
        // Matching a string nobody has enumerated is how this bug comes back, harder to see.
        const { invalidate } = renderSync()

        act(() => eventBus.emit('payment:succeeded', { purchaseType: null }))

        await waitFor(() =>
            expect(invalidate).toHaveBeenCalledWith({ queryKey: membershipKeys.mine }),
        )
    })

    it('leaves the space price list alone — a purchase does not change what a tier costs', async () => {
        const { invalidate } = renderSync()

        act(() => eventBus.emit('payment:succeeded', { purchaseType: 'membership' }))

        await waitFor(() => expect(invalidate).toHaveBeenCalled())
        // `mine` is a prefix of the account's own rows; `channelPackages` sits outside it, so
        // settling no longer refetches the tiers of the space just bought into.
        const keys = invalidate.mock.calls.map(([arg]) => JSON.stringify(arg?.queryKey))
        expect(keys).toContain(JSON.stringify(membershipKeys.mine))
        expect(keys).not.toContain(JSON.stringify(membershipKeys.all))
        expect(membershipKeys.channelPackages('acct-1', 'ada')).not.toEqual(
            expect.arrayContaining(['mine']),
        )
    })

    it('stops listening when it unmounts', async () => {
        const { invalidate, unmount } = renderSync()
        unmount()

        act(() => eventBus.emit('payment:succeeded', { purchaseType: 'membership' }))

        await Promise.resolve()
        expect(invalidateETagCache).not.toHaveBeenCalled()
        expect(invalidate).not.toHaveBeenCalled()
    })
})
