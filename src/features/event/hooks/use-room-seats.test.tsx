// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useRoomSeats } from './use-room-seats'

const getRoom = vi.hoisted(() => vi.fn())
vi.mock('@features/auth', () => ({ useAuth: () => ({ activeId: 'acc-1' }) }))
vi.mock('../api/live-api', async () => {
    const actual = await vi.importActual<typeof import('../api/live-api')>('../api/live-api')
    return { ...actual, liveApi: { getRoom } }
})

const ROOM = {
    layout: { layout: 'P3', spotlight: false, spotlight_uid: null, spotlightUid: null },
    publishers: [{ id: 'u1', name: 'Ada', avatar: null, audio: true, video: true, is_host: true }],
}

function probe(enabled: boolean) {
    const seen: { current: ReturnType<typeof useRoomSeats> | null } = { current: null }
    function Probe() {
        seen.current = useRoomSeats({ code: 'evt-1', enabled })
        return null
    }
    render(
        <QueryClientProvider client={new QueryClient()}>
            <Probe />
        </QueryClientProvider>,
    )
    return seen
}

/**
 * The seats behind the wall when no preview brought them — the looks were spent, or the preview
 * was refused. `layout/` plays nothing, so asking it costs no look; asking it when not needed is
 * still a request on the reader's behalf for nothing.
 */
describe('useRoomSeats', () => {
    it('asks who is on stage when the wall needs the seats', async () => {
        getRoom.mockReset().mockResolvedValue(ROOM)
        const seen = probe(true)
        await waitFor(() => expect(seen.current?.publishers).toHaveLength(1))
        expect(seen.current?.layout?.layout).toBe('P3')
    })

    it('asks nothing when the seats are already in hand', async () => {
        getRoom.mockReset().mockResolvedValue(ROOM)
        const seen = probe(false)
        await Promise.resolve()
        expect(getRoom).not.toHaveBeenCalled()
        expect(seen.current?.publishers).toEqual([])
    })
})
