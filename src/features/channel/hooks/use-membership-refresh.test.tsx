// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { channelKeys } from '../api/channel-api'
import { useMembershipRefresh } from './use-membership-refresh'

/**
 * A reader sent to a space from a locked post or a DM's member wall joins there — and the posts the
 * membership unlocks are this feature's data, not membership's. Pinned here: what is re-read, for
 * whom, and that the stored validators are dropped **before** the refetch (B72's 304 replay).
 */
const invalidateETagCache = vi.hoisted(() => vi.fn(async (..._args: unknown[]) => {}))

vi.mock('@shared/lib/api/interceptors/etag', () => ({
    ANON_SCOPE: 'anon',
    CACHE_TTL: { day: 0, hour: 0 },
    invalidateETagCache,
}))
vi.mock('@features/auth', () => ({ useAuth: () => ({ activeId: 'acct-1' }) }))
vi.mock('@features/post', () => ({ postKeys: { all: ['post'] } }))

function renderRefresh() {
    const queryClient = new QueryClient()
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')
    let refresh: () => Promise<void> = async () => {}
    function Probe() {
        refresh = useMembershipRefresh('ada')
        return null
    }
    render(
        <QueryClientProvider client={queryClient}>
            <Probe />
        </QueryClientProvider>,
    )
    return { invalidate, refresh: () => refresh() }
}

beforeEach(() => vi.clearAllMocks())

describe('useMembershipRefresh', () => {
    it("re-reads the space, its stats, both thread tabs and the post cache — this account's only", async () => {
        const { invalidate, refresh } = renderRefresh()

        await act(refresh)

        const keys = invalidate.mock.calls.map(([filters]) => filters?.queryKey)
        expect(keys).toEqual([
            channelKeys.detail('ada', 'acct-1'),
            channelKeys.stats('ada', 'acct-1'),
            channelKeys.threads('ada', 'posts', 'acct-1'),
            channelKeys.threads('ada', 'media', 'acct-1'),
            ['post'],
        ])
    })

    it('drops the space and thread validators for this account before any refetch is asked for', async () => {
        const order: string[] = []
        invalidateETagCache.mockImplementation(async () => {
            order.push('etag')
        })
        const { invalidate, refresh } = renderRefresh()
        invalidate.mockImplementation(() => {
            order.push('invalidate')
            return Promise.resolve()
        })

        await act(refresh)

        expect(order.slice(0, 3)).toEqual(['etag', 'etag', 'invalidate'])
        const urls = invalidateETagCache.mock.calls.map(([scope, url]) => [scope, url])
        expect(urls).toEqual([
            ['acct-1', expect.stringMatching(/\/v3\/channel\/channels\/ada\/$/)],
            ['acct-1', expect.stringMatching(/\/v3\/channel\/channels\/ada\/threads\/$/)],
        ])
    })
})
