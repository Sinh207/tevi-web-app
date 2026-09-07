// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { FollowRequestsPage } from '../lib/follow-requests-page'
import { useFollowRequests } from './use-follow-requests'

/**
 * The three things about this hook a comment cannot pin, all of them *timing*, and none of them
 * visible as a failure in a browser:
 *
 * 1. **Single-flight.** Two answers in flight at once leave one row spinning forever, because a
 *    mutation's `isPending` and `variables` describe only its most recent run.
 * 2. **The row leaves after the animation, not with it.** The removal is a cache write scheduled
 *    behind a 320ms timer; get that wrong and the row either disappears without its exit or
 *    stays in a cache with a 60s `staleTime`, offering two buttons that now 404.
 * 3. **A bulk answer empties the list at once.** Waiting for the refetch means offering Accept
 *    on rows the server has already dealt with.
 */

const getFollowRequests = vi.hoisted(() => vi.fn())
const acceptFollowRequest = vi.hoisted(() => vi.fn())
const declineFollowRequest = vi.hoisted(() => vi.fn())
const acceptAllFollowRequests = vi.hoisted(() => vi.fn())
const declineAllFollowRequests = vi.hoisted(() => vi.fn())
const auth = vi.hoisted(() => ({ state: { activeId: 'acc-1', isAuthenticated: true } }))

vi.mock('@features/auth', () => ({ useAuth: () => auth.state }))
vi.mock('@shared/i18n/use-translation', () => ({
    useTranslation: () => ({ t: (key: string) => key, currentLanguage: 'en' }),
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
/** The hook reads it only to invalidate the space's own stats after an accept. */
vi.mock('../providers/my-channel-provider', () => ({
    useMyChannel: () => ({ myChannel: { slug: 'ada' } }),
}))
vi.mock('../api/channel-api', async () => {
    const actual = await vi.importActual<typeof import('../api/channel-api')>('../api/channel-api')
    return {
        ...actual,
        channelApi: {
            ...actual.channelApi,
            getFollowRequests,
            acceptFollowRequest,
            declineFollowRequest,
            acceptAllFollowRequests,
            declineAllFollowRequests,
        },
    }
})

/**
 * A promise the test releases by hand — the only way to hold a mutation *in flight* long enough
 * to press a second button, which is the state single-flight exists for. Every other request in
 * this file resolves immediately.
 */
function deferred(): { promise: Promise<unknown>; release: () => void } {
    let release!: () => void
    const promise = new Promise(resolve => {
        release = () => resolve({})
    })
    return { promise, release }
}

/** Rows with ids only — nothing here reads what is in them. */
function page(count: number): FollowRequestsPage {
    return {
        results: Array.from({ length: count }, (_, index) => ({
            id: `req-${index}`,
            created_at: null,
            user: { id: `user-${index}`, slug: `user-${index}`, avatar: {} },
        })) as FollowRequestsPage['results'],
        count,
        next: null,
    }
}

function mount() {
    /* `staleTime` mirrors the app's own client (`shared/lib/api/query-client.ts`). */
    const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false, staleTime: 60_000 } },
    })
    let api!: ReturnType<typeof useFollowRequests>
    function Probe() {
        api = useFollowRequests()
        return null
    }
    render(
        <QueryClientProvider client={queryClient}>
            <Probe />
        </QueryClientProvider>,
    )
    return {
        /** Always the latest render's value — `respond` closes over the pending state. */
        read: () => api,
        ids: () => api.entries.map(entry => entry.id),
        /**
         * Let pending promises resolve and React re-render. `waitFor` is not usable here: it
         * polls on timers this file has faked, so it would spin until the test times out. Every
         * request resolves immediately, so advancing by zero flushes the microtask queue.
         */
        flush: async () => {
            await act(async () => {
                await vi.advanceTimersByTimeAsync(0)
            })
        },
        /** Past the row's exit animation, which is when the cache write lands. */
        exit: async () => {
            await act(async () => {
                await vi.advanceTimersByTimeAsync(320)
            })
        },
    }
}

beforeEach(() => {
    vi.useFakeTimers()
    auth.state = { activeId: 'acc-1', isAuthenticated: true }
    getFollowRequests.mockReset().mockResolvedValue(page(3))
    acceptFollowRequest.mockReset().mockResolvedValue({})
    declineFollowRequest.mockReset().mockResolvedValue({})
    acceptAllFollowRequests.mockReset().mockResolvedValue({})
    declineAllFollowRequests.mockReset().mockResolvedValue({})
})

afterEach(() => {
    vi.useRealTimers()
})

describe('useFollowRequests', () => {
    it('answers one request at a time, whichever button the second press was', async () => {
        const inFlight = deferred()
        acceptFollowRequest.mockReturnValue(inFlight.promise)

        const probe = mount()
        await probe.flush()
        const rows = probe.read().entries

        act(() => probe.read().respond(rows[0], 'accept'))
        // The pending state is a React update, so it lands a microtask after `mutate` — which is
        // still before paint, i.e. before a real second press could exist.
        await probe.flush()
        expect(probe.read().isResponding).toBe(true)

        // The second press, on a different row and the other verb. Refused by the hook; the view
        // has also disabled the button by now, which is the belt to these braces.
        act(() => probe.read().respond(rows[1], 'decline'))
        expect(declineFollowRequest).not.toHaveBeenCalled()

        inFlight.release()
        await probe.flush()
        expect(acceptFollowRequest).toHaveBeenCalledTimes(1)
        expect(declineFollowRequest).not.toHaveBeenCalled()
    })

    it('reports which row and which answer is in flight', async () => {
        const inFlight = deferred()
        declineFollowRequest.mockReturnValue(inFlight.promise)

        const probe = mount()
        await probe.flush()
        const rows = probe.read().entries

        act(() => probe.read().respond(rows[1], 'decline'))
        await probe.flush()
        expect(probe.read().pendingId).toBe(rows[1].id)
        expect(probe.read().pendingAction).toBe('decline')
        expect(probe.read().isResponding).toBe(true)

        inFlight.release()
        await probe.flush()
        expect(probe.read().isResponding).toBe(false)
        expect(probe.read().pendingId).toBeNull()
    })

    it('keeps the row mounted for its exit, then drops it from the cache', async () => {
        const probe = mount()
        await probe.flush()
        const target = probe.read().entries[0].id

        act(() => probe.read().respond(probe.read().entries[0], 'accept'))
        await probe.flush()

        // Answered on the server, still on screen, already announced as gone.
        expect(probe.ids()).toContain(target)
        expect(probe.read().exitingIds.has(target)).toBe(true)

        await probe.exit()
        expect(probe.ids()).not.toContain(target)
        expect(probe.read().exitingIds.has(target)).toBe(false)
        // The total follows the row out, so the live region does not announce a stale figure.
        expect(probe.read().total).toBe(2)
    })

    it('empties the list on a bulk answer without waiting for the refetch', async () => {
        getFollowRequests.mockReset().mockResolvedValueOnce(page(3)).mockResolvedValue(page(0))
        const probe = mount()
        await probe.flush()
        expect(probe.ids()).toHaveLength(3)

        const inFlight = deferred()
        declineAllFollowRequests.mockReturnValue(inFlight.promise)

        act(() => probe.read().respondAll('decline'))
        await probe.flush()
        // The bar spins the button that was pressed, and the rows are still there: the server has
        // not answered yet, and nothing here is optimistic.
        expect(probe.read().bulkAction).toBe('decline')
        expect(probe.ids()).toHaveLength(3)

        inFlight.release()
        await probe.flush()

        expect(declineAllFollowRequests).toHaveBeenCalledTimes(1)
        // Every loaded row is marked exiting and still mounted — this is the 320ms the panel
        // spends collapsing. Clearing the cache here instead is what made a bulk press look like
        // a glitch rather than a result.
        expect(probe.read().exitingIds.size).toBe(3)
        expect(probe.ids()).toHaveLength(3)

        await probe.exit()
        expect(probe.ids()).toEqual([])
        expect(probe.read().total).toBe(0)
        expect(probe.read().exitingIds.size).toBe(0)
        // Emptied *and* re-asked: a request that arrived while the bulk call was in flight is
        // the reason the second fetch exists.
        expect(getFollowRequests.mock.calls.length).toBeGreaterThan(1)
    })

    /**
     * The interleaving that made `finalizeExit` need a guard: answer one row, then press a bulk
     * action while that row is still collapsing. Its own timer fires *during* the bulk exit, and
     * without the guard it would drop the id out of `exitingIds` — putting a row that has already
     * been answered back on screen, at full opacity, for the rest of the animation.
     */
    it('does not let a row mid-exit reappear when a bulk answer lands on top of it', async () => {
        // The refetch behind the clear answers empty, as a real one would after `accept-all` —
        // otherwise this test is asserting against the mock repopulating the list.
        getFollowRequests.mockReset().mockResolvedValueOnce(page(3)).mockResolvedValue(page(0))
        const probe = mount()
        await probe.flush()
        const first = probe.read().entries[0].id

        act(() => probe.read().respond(probe.read().entries[0], 'accept'))
        await probe.flush()
        expect(probe.read().exitingIds.has(first)).toBe(true)

        // 160ms into that row's exit — its timer has not fired yet.
        await act(async () => {
            await vi.advanceTimersByTimeAsync(160)
        })
        act(() => probe.read().respondAll('accept'))
        await probe.flush()
        expect(probe.read().exitingIds.has(first)).toBe(true)

        // Past the row's own timer, still inside the bulk clear's window.
        await act(async () => {
            await vi.advanceTimersByTimeAsync(200)
        })
        expect(probe.read().exitingIds.has(first)).toBe(true)

        await probe.exit()
        expect(probe.ids()).toEqual([])
    })

    it('asks for nothing at all without a real account', async () => {
        auth.state = { activeId: null as unknown as string, isAuthenticated: false }
        const probe = mount()
        await probe.flush()
        expect(getFollowRequests).not.toHaveBeenCalled()
        expect(probe.read().isSignedOut).toBe(true)
    })
})
