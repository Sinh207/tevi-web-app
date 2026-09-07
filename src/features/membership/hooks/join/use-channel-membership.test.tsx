// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useChannelMembership } from './use-channel-membership'

/**
 * An **ordinary conditional read**, and that is the point worth pinning.
 *
 * This briefly sent `fresh: true` — no `If-None-Match`, ever — to get around a backend that answers
 * 304 after a membership settles (B72). That bought correctness for the seconds after a purchase by
 * paying a full body on every space page for the rest of time. The staleness has one cause and one
 * moment, so it is handled there: `useMembershipPaymentSync` drops the stored validator when a
 * payment settles, and this read stays conditional.
 */
const getMyMemberships = vi.hoisted(() => vi.fn())

vi.mock('../../api/subscription-api', async () => {
    const actual = await vi.importActual<typeof import('../../api/subscription-api')>(
        '../../api/subscription-api',
    )
    return { ...actual, membershipApi: { ...actual.membershipApi, getMyMemberships } }
})

vi.mock('@features/auth', () => ({
    useAuth: () => ({ activeId: 'acct-1', isAuthenticated: true }),
}))

function renderHook(channelId: string | null = 'ch_1') {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    let api!: ReturnType<typeof useChannelMembership>
    function Probe() {
        api = useChannelMembership(channelId)
        return null
    }
    render(
        <QueryClientProvider client={queryClient}>
            <Probe />
        </QueryClientProvider>,
    )
    return () => api
}

beforeEach(() => {
    vi.clearAllMocks()
    getMyMemberships.mockResolvedValue({ results: [], count: 0, received: 0 })
})

describe('useChannelMembership', () => {
    it('asks about one space, conditionally — the ETag layer is left doing its job', async () => {
        renderHook()

        await waitFor(() => expect(getMyMemberships).toHaveBeenCalled())
        expect(getMyMemberships).toHaveBeenCalledWith(
            expect.objectContaining({ channelId: 'ch_1', status: 'active', accountId: 'acct-1' }),
        )
        // Nothing here opts out of caching: a purchase evicts, a read does not.
        expect(getMyMemberships.mock.calls[0][0]).not.toHaveProperty('fresh')
    })

    it('asks only about active memberships', async () => {
        // A cancelled membership is still active until its term ends — that reader *is* a member.
        // An expired one is not. The server-side filter answers it exactly.
        renderHook()
        await waitFor(() => expect(getMyMemberships).toHaveBeenCalled())
        expect(getMyMemberships.mock.calls[0][0].status).toBe('active')
    })

    it('does not ask at all without a channel', () => {
        renderHook(null)
        expect(getMyMemberships).not.toHaveBeenCalled()
    })
})
