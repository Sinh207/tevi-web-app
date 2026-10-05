// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { eventKeys } from '../api/event-api'
import { liveKeys } from '../api/live-api'
import { useLiveEventSync } from './use-live-event-sync'
import type { LiveRoomState } from './use-live-room'

/**
 * **Two channels that were declared and never consumed.**
 *
 * `data_change` and `lock` arrived, dispatched to an empty handler set and vanished — so a stream
 * locked behind its paywall mid-broadcast kept playing for whoever was already watching, and a
 * renamed event kept its old title until a reload. The claims worth pinning are that the frame
 * invalidates rather than writes, and that a repeat of the same `updated_at` costs no request.
 */
function makeRoom() {
    const handlers = new Map<string, (payload: unknown) => void>()
    const room: LiveRoomState = {
        status: 'connected',
        isConnected: true,
        isRefused: false,
        refusalMessage: null,
        subscribe: (channel, handler) => {
            handlers.set(channel, handler)
            return () => handlers.delete(channel)
        },
    }
    return { room, handlers }
}

function mount(onLocked?: () => void) {
    const { room, handlers } = makeRoom()
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const invalidate = vi.spyOn(client, 'invalidateQueries').mockResolvedValue(undefined)

    function Probe() {
        useLiveEventSync({ code: 'evt-1', room, onLocked })
        return null
    }
    render(
        <QueryClientProvider client={client}>
            <Probe />
        </QueryClientProvider>,
    )
    return { handlers, invalidate }
}

describe('the event-record frames', () => {
    it('invalidates the event rather than writing the frame into the cache', () => {
        const { handlers, invalidate } = mount()

        act(() => handlers.get('data_change')?.({ updated_at: '2026-01-01T00:00:00Z' }))
        expect(invalidate).toHaveBeenCalledWith({ queryKey: eventKeys.all })

        act(() => handlers.get('lock')?.({ updated_at: '2026-01-01T00:00:01Z' }))
        expect(invalidate).toHaveBeenCalledTimes(2)
    })

    it('skips a repeat of the same stamp, and still refetches one that carries none', () => {
        const { handlers, invalidate } = mount()

        act(() => handlers.get('data_change')?.({ updated_at: 'same' }))
        act(() => handlers.get('data_change')?.({ updated_at: 'same' }))
        expect(invalidate).toHaveBeenCalledTimes(1)

        // A thinner payload is not a reason to leave the page stale forever.
        act(() => handlers.get('data_change')?.({}))
        expect(invalidate).toHaveBeenCalledTimes(2)
    })
})

describe('the broadcast locked mid-stream', () => {
    /**
     * The refetch alone cannot tell "locked while watching" from "arrived at a gated stream", and
     * the studio offered the first a preview it had no business spending. The flag is the tell.
     */
    it('raises onLocked as well as refetching', () => {
        const onLocked = vi.fn()
        const { handlers, invalidate } = mount(onLocked)
        act(() => handlers.get('lock')?.({ updated_at: 't1' }))
        expect(onLocked).toHaveBeenCalledTimes(1)
        expect(invalidate).toHaveBeenCalledWith({ queryKey: eventKeys.all })
    })

    /** ⚠ One edit, two frames, one stamp: the shared guard used to drop the lock as a repeat. */
    it('does not drop a lock that carries the same stamp as the data_change before it', () => {
        const onLocked = vi.fn()
        const { handlers } = mount(onLocked)
        act(() => handlers.get('data_change')?.({ updated_at: 'same' }))
        act(() => handlers.get('lock')?.({ updated_at: 'same' }))
        expect(onLocked).toHaveBeenCalledTimes(1)
    })

    it('does not raise onLocked for any other frame', () => {
        const onLocked = vi.fn()
        const { handlers } = mount(onLocked)
        act(() => handlers.get('data_change')?.({ updated_at: 'a' }))
        act(() => handlers.get('live_status')?.({ updated_at: 'b' }))
        expect(onLocked).not.toHaveBeenCalled()
    })
})

describe('the broadcast ending', () => {
    /**
     * ⚠ With no consumer the host could end the stream and a reader kept watching a frozen frame.
     * The refetch is what flips `isStudioEligible` to the *Live ended* screen.
     */
    it('re-asks for the event on a `live_status` frame', () => {
        const { handlers, invalidate } = mount()
        act(() => handlers.get('live_status')?.({ live_status: 'ENDED', updated_at_ts: 1 }))
        expect(invalidate).toHaveBeenCalledWith({ queryKey: eventKeys.all })
    })
})

describe('the stage frames', () => {
    /**
     * The seat grid used to be fixed at whatever `layout/` answered on entry — a co-host joining
     * or somebody muting changed nothing until a reload. Each of the three re-asks the room.
     */
    it.each(['layout', 'publishers_change', 'publisher_state_change'])(
        'invalidates this event’s room on `%s`, and only its room',
        channel => {
            const { handlers, invalidate } = mount()
            act(() => handlers.get(channel)?.({ id: 'u1', audio: false }))
            expect(invalidate).toHaveBeenCalledWith({
                queryKey: [...liveKeys.all, 'room', 'evt-1'],
            })
            expect(invalidate).not.toHaveBeenCalledWith({ queryKey: eventKeys.all })
        },
    )

    /** No stamp to compare, and each frame is somebody on camera doing something visible. */
    it('does not de-duplicate them', () => {
        const { handlers, invalidate } = mount()
        act(() => handlers.get('publisher_state_change')?.({ id: 'u1' }))
        act(() => handlers.get('publisher_state_change')?.({ id: 'u1' }))
        expect(invalidate).toHaveBeenCalledTimes(2)
    })
})
