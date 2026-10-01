// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render } from '@testing-library/react'
import { toast } from 'sonner'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { normalizeConversations } from '../api/types'
import { shareMessageText, useShareInMessage } from './use-share-in-message'

const auth = vi.hoisted(() => ({ activeId: 'acc-1' }))
vi.mock('@features/auth', () => ({ useAuth: () => auth }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const api = vi.hoisted(() => ({ sendMessage: vi.fn() }))
vi.mock('../api/message-api', async importOriginal => ({
    ...(await importOriginal<typeof import('../api/message-api')>()),
    forgetConversationCache: vi.fn(() => Promise.resolve()),
    messageApi: api,
}))

const [ada, bob, cy] = normalizeConversations([
    { id: 'c1', recipient: { id: 'u1', active: true, name: 'Ada' } },
    { id: 'c2', recipient: { id: 'u2', active: true, name: 'Bob' } },
    { id: 'c3', recipient: { id: 'u3', active: true, name: 'Cy' } },
])
if (!ada || !bob || !cy) throw new Error('fixtures did not parse')

function setup({ link = 'https://tevi.com/s/abc' } = {}) {
    const resolveLink = vi.fn(() => Promise.resolve(link))
    const onSent = vi.fn()
    const result = {} as { current: ReturnType<typeof useShareInMessage> }
    function Probe() {
        result.current = useShareInMessage({ resolveLink, onSent })
        return null
    }
    render(
        <QueryClientProvider client={new QueryClient()}>
            <Probe />
        </QueryClientProvider>,
    )
    return { result, resolveLink, onSent }
}

beforeEach(() => {
    vi.clearAllMocks()
    auth.activeId = 'acc-1'
})

describe('shareMessageText', () => {
    it('puts the typed text first and the link on its own line', () => {
        expect(shareMessageText('  look at this ', 'https://tevi.com/s/abc')).toBe(
            'look at this\nhttps://tevi.com/s/abc',
        )
    })

    it('sends the link alone when nothing was typed', () => {
        expect(shareMessageText('   ', 'https://tevi.com/s/abc')).toBe('https://tevi.com/s/abc')
    })
})

describe('useShareInMessage', () => {
    it('sends one message per conversation, with one link for all of them', async () => {
        api.sendMessage.mockResolvedValue({ id: 'm' })
        const { result, resolveLink, onSent } = setup()
        act(() => result.current.toggle(ada))
        act(() => result.current.toggle(bob))

        await act(async () => {
            await result.current.send('hi')
        })

        expect(resolveLink).toHaveBeenCalledTimes(1)
        expect(api.sendMessage.mock.calls.map(([body]) => body)).toEqual([
            { conversationId: 'c1', text: 'hi\nhttps://tevi.com/s/abc', accountId: 'acc-1' },
            { conversationId: 'c2', text: 'hi\nhttps://tevi.com/s/abc', accountId: 'acc-1' },
        ])
        expect(onSent).toHaveBeenCalledTimes(1)
        expect(toast.success).toHaveBeenCalledWith('share_dm_sent_to_others', expect.anything())
    })

    it('keeps exactly the failed recipients selected when nothing got through', async () => {
        api.sendMessage.mockRejectedValue(new Error('502'))
        const { result, onSent } = setup()
        act(() => result.current.toggle(ada))
        act(() => result.current.toggle(bob))

        let delivered = true
        await act(async () => {
            delivered = await result.current.send('hi')
        })

        expect(delivered).toBe(false)
        expect(onSent).not.toHaveBeenCalled()
        expect(result.current.selected.map(row => row.id)).toEqual(['c1', 'c2'])
        expect(toast.success).not.toHaveBeenCalled()
        expect(toast.error).toHaveBeenCalledWith('share_dm_failed_to_others', expect.anything())
    })

    it('closes on a partial success and names who did not get it', async () => {
        api.sendMessage
            .mockResolvedValueOnce({ id: 'm1' })
            .mockRejectedValueOnce(new Error('502'))
            .mockResolvedValueOnce({ id: 'm3' })
        const { result, onSent } = setup()
        act(() => result.current.toggle(ada))
        act(() => result.current.toggle(bob))
        act(() => result.current.toggle(cy))

        await act(async () => {
            await result.current.send('')
        })

        expect(onSent).toHaveBeenCalledTimes(1)
        expect(toast.success).toHaveBeenCalledWith('share_dm_sent_to_others', expect.anything())
        expect(toast.error).toHaveBeenCalledWith('share_dm_failed_to', expect.anything())
    })

    it('posts as the account that pressed Send, even if it switches mid-flight', async () => {
        let release: () => void = () => undefined
        const { result } = setup()
        const gate = new Promise<void>(resolve => (release = resolve))
        api.sendMessage.mockImplementation(async () => {
            await gate
            return { id: 'm' }
        })
        act(() => result.current.toggle(ada))

        let sending: Promise<boolean> = Promise.resolve(false)
        act(() => {
            sending = result.current.send('')
        })
        auth.activeId = 'acc-2'
        await act(async () => {
            release()
            await sending
        })

        expect(api.sendMessage).toHaveBeenCalledWith(
            expect.objectContaining({ accountId: 'acc-1' }),
        )
    })

    it('does nothing with no conversation picked', async () => {
        const { result, resolveLink } = setup()
        await act(async () => {
            await result.current.send('hi')
        })
        expect(resolveLink).not.toHaveBeenCalled()
        expect(api.sendMessage).not.toHaveBeenCalled()
    })
})
