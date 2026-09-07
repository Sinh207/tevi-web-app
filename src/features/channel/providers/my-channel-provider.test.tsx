// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, waitFor } from '@testing-library/react'
import { act } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MyChannelProvider, useMyChannel } from './my-channel-provider'

/**
 * The one thing this provider promises that no call site can show: **when the server says the
 * account's Premium state changed, the next read is not the body we already had.**
 *
 * `is_premium` from `my-channel` is what the whole app draws Premium from — the drawer's gold profile
 * card, the avatar's ring and crown, `/premium`'s hero branch and whether the plan grid is offered.
 * So a re-read that comes back stale leaves a paying reader looking at the offer, and there is
 * nothing on screen to say why.
 */

const getMyChannel = vi.hoisted(() => vi.fn())
/** Records the order the two steps happen in — which is the claim, not that both happened. */
const calls = vi.hoisted(() => [] as string[])
const forgetMyChannelCache = vi.hoisted(() =>
    vi.fn(async (accountId: string | null) => {
        calls.push(`forget:${accountId}`)
    }),
)

vi.mock('../api/channel-api', async () => {
    const actual = await vi.importActual<typeof import('../api/channel-api')>('../api/channel-api')
    return {
        ...actual,
        forgetMyChannelCache,
        channelApi: { ...actual.channelApi, getMyChannel },
    }
})

const authState = { activeId: null as string | null, isAuthenticated: false }
vi.mock('@features/auth', () => ({ useAuth: () => authState }))

/**
 * The realtime room is stubbed so this stays a unit test — otherwise `useSocketEvent` reaches for the
 * real singleton and pulls `socket.io-client` into every run. The handler is captured, which is what
 * lets the test fire `premium_info`.
 */
const socketHandlers = new Map<string, (payload: unknown) => void>()
vi.mock('@features/realtime', () => ({
    useSocketEvent: (event: string, handler: (payload: unknown) => void) => {
        socketHandlers.set(event, handler)
    },
}))

vi.mock('next/navigation', () => ({ usePathname: () => '/' }))

const BASIC = { id: 'ch1', slug: 'ada', name: 'Ada', is_premium: false, privacy: 'published' }
const PREMIUM = { ...BASIC, is_premium: true }

function renderProvider() {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    let seen: ReturnType<typeof useMyChannel> | null = null
    function Probe() {
        seen = useMyChannel()
        return null
    }
    render(
        <QueryClientProvider client={queryClient}>
            <MyChannelProvider>
                <Probe />
            </MyChannelProvider>
        </QueryClientProvider>,
    )
    return {
        read: () => {
            if (!seen) throw new Error('probe never rendered')
            return seen
        },
    }
}

beforeEach(() => {
    calls.length = 0
    getMyChannel.mockReset()
    forgetMyChannelCache.mockClear()
    socketHandlers.clear()
    authState.activeId = null
    authState.isAuthenticated = false
})

describe('MyChannelProvider on the premium_info frame', () => {
    /**
     * **The eviction happens, it is first, and it names the right account.**
     *
     * The handler used to be a bare `refresh()`, and that is a silent failure rather than a visible
     * one: the refetch carries an `If-None-Match`, the service answers `304` because its validator
     * has not moved, and `apiClient` replays the body being replaced. "A second request went out"
     * passes either way — which is why this asserts the *order*. `invalidateQueries` starts the
     * request synchronously, so evicting afterwards drops a record the request has already read.
     * **B72.**
     */
    it('evicts the cached body before re-reading it, for the account the frame arrived for', async () => {
        authState.activeId = '7'
        authState.isAuthenticated = true
        getMyChannel.mockImplementation(async () => {
            calls.push('fetch')
            return calls.includes('forget:7') ? PREMIUM : BASIC
        })

        const { read } = renderProvider()
        await waitFor(() => expect(read().hasChannel).toBe(true))
        expect(read().isPremium).toBe(false)
        calls.length = 0

        await act(async () => {
            socketHandlers.get('premium_info')?.({ is_premium: true })
        })

        await waitFor(() => expect(read().isPremium).toBe(true))
        expect(forgetMyChannelCache).toHaveBeenCalledWith('7')
        expect(calls[0]).toBe('forget:7')
    })

    /**
     * The frame carries a Premium state and it is **not** written into the cache — the app's rule for
     * every socket event: a frame is a signal, never a source. A frame has no ordering guarantee
     * against the HTTP responses beside it, so trusting its payload can move the flag backwards.
     * Here the service still answers `is_premium: false`, and the provider believes the service.
     */
    it('believes the re-read and not the payload', async () => {
        authState.activeId = '7'
        authState.isAuthenticated = true
        getMyChannel.mockResolvedValue(BASIC)

        const { read } = renderProvider()
        await waitFor(() => expect(read().hasChannel).toBe(true))

        await act(async () => {
            socketHandlers.get('premium_info')?.({ is_premium: true })
        })
        await waitFor(() => expect(getMyChannel).toHaveBeenCalledTimes(2))

        expect(read().isPremium).toBe(false)
    })

    /** An anonymous session has no channel and never will, so the frame costs nothing. */
    it('asks for nothing when there is no real account', async () => {
        authState.activeId = null
        authState.isAuthenticated = false

        renderProvider()
        await act(async () => {
            socketHandlers.get('premium_info')?.({ is_premium: true })
        })

        expect(getMyChannel).not.toHaveBeenCalled()
    })
})
