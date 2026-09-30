// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { RoomResult } from '../api/message-api'
import { normalizeConversations } from '../api/types'
import { useRoomMute } from './use-room-mute'

vi.mock('@features/auth', () => ({ useAuth: () => ({ activeId: 'acc-1' }) }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const api = vi.hoisted(() => ({ setMuted: vi.fn() }))
vi.mock('../api/message-api', async importOriginal => ({
    ...(await importOriginal<typeof import('../api/message-api')>()),
    forgetConversationCache: vi.fn(() => Promise.resolve()),
    messageApi: api,
}))

const [parsed] = normalizeConversations([{ id: 'c1', my_settings: { muted: false } }])
if (!parsed) throw new Error('fixture did not parse')
const conversation = parsed
const roomKey = ['message', 'room', 'owner', true, false, 'acc-1']

function setup() {
    const queryClient = new QueryClient()
    const room: RoomResult = { kind: 'open', conversation }
    queryClient.setQueryData(roomKey, room)
    const result = {} as { current: ReturnType<typeof useRoomMute> }
    function Probe() {
        result.current = useRoomMute(conversation, 'Ada')
        return null
    }
    render(
        <QueryClientProvider client={queryClient}>
            <Probe />
        </QueryClientProvider>,
    )
    return { result, queryClient }
}

const mutedIn = (queryClient: QueryClient) => {
    const room = queryClient.getQueryData<RoomResult>(roomKey)
    return room?.kind === 'open' ? room.conversation.my_settings?.muted : undefined
}

describe('useRoomMute', () => {
    it('flips the room only once the server has agreed', async () => {
        let resolve: (value: unknown) => void = () => undefined
        api.setMuted.mockReturnValueOnce(new Promise(r => (resolve = r)))
        const { result, queryClient } = setup()

        await act(async () => result.current.toggle())
        expect(api.setMuted).toHaveBeenCalledWith('c1', true, 'acc-1')
        expect(mutedIn(queryClient)).toBe(false)

        await act(async () => resolve({}))
        expect(mutedIn(queryClient)).toBe(true)
    })

    it('leaves the room as it was when the write fails', async () => {
        api.setMuted.mockRejectedValueOnce(new Error('502'))
        const { result, queryClient } = setup()
        await act(async () => result.current.toggle())
        expect(mutedIn(queryClient)).toBe(false)
    })
})
