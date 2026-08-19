// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { channelKeys } from '../api/channel-api'
import type { Channel } from '../api/types'
import { useChannel } from './use-channel'

/**
 * What this hook promises that its call site cannot see: **which cached entry it paints from before
 * it fetches anything.**
 *
 * There are two seeds and they are not interchangeable. The server's is the *anonymous* body under a
 * `null` account key and must be treated as stale on arrival, or a signed-in visitor sits with
 * `is_followed: false` and a Follow button that lies. `my-channel`'s is the account's own body under
 * its own key, already correct, and carrying its real age across is what lets a creator walk into
 * their own space without watching a skeleton for data the app fetched minutes ago.
 *
 * Both are `initialData` callbacks that read the cache, so neither shows up in a render tree, a type,
 * or a network log — which is exactly the kind of thing that gets deleted by someone tidying up.
 */

const getChannel = vi.hoisted(() => vi.fn())
const auth = vi.hoisted(() => ({ state: { activeId: 'acc-1' as string | null } }))

vi.mock('@features/auth', () => ({ useAuth: () => auth.state }))
vi.mock('../api/channel-api', async () => {
    const actual = await vi.importActual<typeof import('../api/channel-api')>('../api/channel-api')
    return { ...actual, channelApi: { ...actual.channelApi, getChannel } }
})

const SLUG = 'ada'
const MINE = { slug: SLUG, name: 'Ada', owner_id: 'user-1' } as Channel
const FETCHED = { slug: SLUG, name: 'Ada (fetched)', owner_id: 'user-1' } as Channel

function renderChannel(slug = SLUG) {
    const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false, staleTime: 60_000 } },
    })
    let api: ReturnType<typeof useChannel> | null = null
    function Probe() {
        api = useChannel(slug)
        return null
    }
    const seed = (data: Channel | null, updatedAt?: number) =>
        queryClient.setQueryData(channelKeys.myChannel('acc-1'), data, { updatedAt })

    return {
        queryClient,
        seed,
        mount: () =>
            render(
                <QueryClientProvider client={queryClient}>
                    <Probe />
                </QueryClientProvider>,
            ),
        read: () => api as ReturnType<typeof useChannel>,
    }
}

beforeEach(() => {
    getChannel.mockReset().mockResolvedValue(FETCHED)
    auth.state = { activeId: 'acc-1' }
})

describe('useChannel', () => {
    describe('the account’s own channel', () => {
        it('paints from `my-channel` on the first render, with no loading state', () => {
            const h = renderChannel()
            h.seed(MINE, Date.now())
            h.mount()

            // The whole point: no skeleton on the way into your own space.
            expect(h.read().isLoading).toBe(false)
            expect(h.read().channel?.name).toBe('Ada')
        })

        it('does not refetch when that entry is still fresh', async () => {
            const h = renderChannel()
            h.seed(MINE, Date.now())
            h.mount()

            await Promise.resolve()
            expect(getChannel).not.toHaveBeenCalled()
        })

        it('paints instantly but revalidates when the entry is older than the staleTime', async () => {
            const h = renderChannel()
            // Two minutes old: `my-channel` holds it for five, this key considers it stale after one.
            h.seed(MINE, Date.now() - 2 * 60_000)
            h.mount()

            expect(h.read().channel?.name).toBe('Ada')
            await waitFor(() => expect(getChannel).toHaveBeenCalled())
            await waitFor(() => expect(h.read().channel?.name).toBe('Ada (fetched)'))
        })

        it('ignores it when the slug belongs to somebody else', () => {
            const h = renderChannel('someone-else')
            h.seed(MINE, Date.now())
            h.mount()

            expect(h.read().channel).toBeUndefined()
            expect(h.read().isLoading).toBe(true)
        })

        it('survives an account with no channel of its own', () => {
            // `getMyChannel` models a 404 as `null` rather than an error, so `null` is a real
            // cached value here and reading `.slug` off it would throw.
            const h = renderChannel()
            h.seed(null, Date.now())
            expect(() => h.mount()).not.toThrow()
            expect(h.read().isLoading).toBe(true)
        })
    })

    describe('the server’s anonymous seed', () => {
        it('paints from it, and treats it as stale so the personalised fields get corrected', async () => {
            const h = renderChannel()
            h.queryClient.setQueryData(channelKeys.detail(SLUG, null), MINE)
            h.mount()

            expect(h.read().channel?.name).toBe('Ada')
            // No `initialDataUpdatedAt` for this branch — it must not be trusted for 60s.
            await waitFor(() => expect(getChannel).toHaveBeenCalled())
        })
    })
})
