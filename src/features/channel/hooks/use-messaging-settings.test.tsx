// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { channelKeys } from '../api/channel-api'
import { normalizeChannel } from '../api/types'
import { useMessagingSettings } from './use-messaging-settings'

vi.mock('@features/auth', () => ({ useAuth: () => ({ activeId: 'acc-1' }) }))

const refresh = vi.fn()
let myChannel = normalizeChannel({ id: 'c1', slug: 'ada' })
vi.mock('../providers/my-channel-provider', () => ({
    useMyChannel: () => ({ myChannel, refresh }),
}))

const api = vi.hoisted(() => ({ updateMyChannel: vi.fn() }))
vi.mock('../api/channel-api', async importOriginal => ({
    ...(await importOriginal<typeof import('../api/channel-api')>()),
    channelApi: api,
}))

function setup() {
    const queryClient = new QueryClient()
    const result = {} as { current: ReturnType<typeof useMessagingSettings> }
    function Probe() {
        result.current = useMessagingSettings()
        return null
    }
    render(
        <QueryClientProvider client={queryClient}>
            <Probe />
        </QueryClientProvider>,
    )
    return { result, queryClient }
}

beforeEach(() => {
    vi.clearAllMocks()
    myChannel = normalizeChannel({ id: 'c1', slug: 'ada' })
})

describe('useMessagingSettings', () => {
    it('reads followers when the space has never chosen — legacy’s default', () => {
        expect(setup().result.current.sender).toBe('follower')
    })

    it('sends messaging_settings alone, and the saved channel replaces the cached read', async () => {
        const saved = normalizeChannel({
            id: 'c1',
            slug: 'ada',
            messaging_settings: { sender: 'subscriber' },
        })
        api.updateMyChannel.mockResolvedValueOnce(saved)
        const { result, queryClient } = setup()

        let error: unknown
        await act(async () => {
            error = await result.current.save('subscriber')
        })

        expect(error).toBeNull()
        expect(api.updateMyChannel).toHaveBeenCalledWith(
            { messaging_settings: { sender: 'subscriber' } },
            'acc-1',
        )
        expect(queryClient.getQueryData(channelKeys.myChannel('acc-1'))).toEqual(saved)
        expect(refresh).not.toHaveBeenCalled()
    })

    it('hands a refusal back instead of throwing, so the dialog can word it and stay open', async () => {
        api.updateMyChannel.mockRejectedValueOnce(new Error('422'))
        const { result } = setup()
        let error: unknown
        await act(async () => {
            error = await result.current.save('subscriber')
        })
        expect(error).toBeInstanceOf(Error)
    })
})
