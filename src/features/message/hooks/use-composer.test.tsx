// @vitest-environment jsdom
import { act, render } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { normalizeMessages } from '../api/types'
import { type UseComposerResult, useComposer } from './use-composer'

vi.mock('@features/auth', () => ({ useAuth: () => ({ activeId: 'acc-1' }) }))
vi.mock('@shared/lib/remote-config', () => ({
    useWebConfig: () => ({ directMessage: { limitCharacters: 10 } }),
}))
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))

const api = vi.hoisted(() => ({
    sendMessage: vi.fn(),
    editMessage: vi.fn(),
    deleteMessage: vi.fn(),
    sendChatAction: vi.fn(() => Promise.resolve()),
}))
vi.mock('../api/message-api', () => ({ messageApi: api }))

const [serverCopy] = normalizeMessages([{ id: 'srv-1', text: 'hello', created_at: 1 }])

function setup() {
    const onMessage = vi.fn()
    const onDropped = vi.fn()
    const onChanged = vi.fn()
    const result = {} as { current: UseComposerResult }
    function Probe() {
        result.current = useComposer({ conversationId: 'c1', onMessage, onDropped, onChanged })
        return null
    }
    render(<Probe />)
    return { result, onMessage, onDropped, onChanged }
}

describe('useComposer', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('holds a send as pending until the server copy arrives, then hands it over', async () => {
        let resolve: (value: unknown) => void = () => undefined
        api.sendMessage.mockReturnValue(new Promise(r => (resolve = r)))
        const { result, onMessage } = setup()

        act(() => result.current.setText('hello'))
        await act(async () => result.current.submit())
        expect(result.current.pending).toHaveLength(1)
        expect(result.current.pending[0]).toMatchObject({ text: 'hello', status: 'sending' })
        expect(result.current.text).toBe('')

        await act(async () => resolve(serverCopy))
        expect(onMessage).toHaveBeenCalledWith(serverCopy)
        expect(result.current.pending).toHaveLength(0)
    })

    it('keeps a failed send, and Retry sends the same text again', async () => {
        api.sendMessage.mockRejectedValueOnce(new Error('502')).mockResolvedValueOnce(serverCopy)
        const { result, onMessage } = setup()

        act(() => result.current.setText('hello'))
        await act(async () => result.current.submit())
        expect(result.current.pending[0].status).toBe('failed')

        await act(async () => result.current.retry(result.current.pending[0].localId))
        expect(api.sendMessage).toHaveBeenLastCalledWith(expect.objectContaining({ text: 'hello' }))
        expect(onMessage).toHaveBeenCalledWith(serverCopy)
        expect(result.current.pending).toHaveLength(0)
    })

    it('sends the reply target with the message and clears it', async () => {
        api.sendMessage.mockResolvedValue(serverCopy)
        const [target] = normalizeMessages([{ id: 'r-1', text: 'quoted' }])
        const { result } = setup()

        act(() => result.current.startReply(target))
        act(() => result.current.setText('yes'))
        await act(async () => result.current.submit())
        expect(api.sendMessage).toHaveBeenCalledWith(expect.objectContaining({ replyToId: 'r-1' }))
        expect(result.current.replyTo).toBeNull()
    })

    /* The limit is shown, not enforced by cutting the text. */
    it('refuses to send past the limit but keeps the text', async () => {
        const { result } = setup()
        act(() => result.current.setText('x'.repeat(11)))
        expect(result.current.overLimit).toBe(true)
        expect(result.current.canSend).toBe(false)
        await act(async () => result.current.submit())
        expect(api.sendMessage).not.toHaveBeenCalled()
        expect(result.current.text).toHaveLength(11)
    })

    it('edits in place and waits for the server before replacing the bubble', async () => {
        const [original] = normalizeMessages([{ id: 'e-1', text: 'typo' }])
        const [fixed] = normalizeMessages([{ id: 'e-1', text: 'fixed', edited_at: 5 }])
        api.editMessage.mockResolvedValue(fixed)
        const { result, onMessage } = setup()

        act(() => result.current.startEdit(original))
        expect(result.current.text).toBe('typo')
        act(() => result.current.setText('fixed'))
        await act(async () => result.current.submit())
        expect(api.editMessage).toHaveBeenCalledWith('e-1', 'fixed', 'acc-1')
        expect(onMessage).toHaveBeenCalledWith(fixed)
        expect(result.current.editing).toBeNull()
        expect(api.sendMessage).not.toHaveBeenCalled()
    })

    it('signals typing once for a burst, and NONE when the field empties', () => {
        const { result } = setup()
        act(() => result.current.setText('h'))
        act(() => result.current.setText('he'))
        expect(api.sendChatAction).toHaveBeenCalledTimes(1)
        expect(api.sendChatAction).toHaveBeenLastCalledWith('c1', 'TYPING', 'acc-1')
        act(() => result.current.setText(''))
        expect(api.sendChatAction).toHaveBeenLastCalledWith('c1', 'NONE', 'acc-1')
    })

    it('drops a message only after the server confirms the delete', async () => {
        const [target] = normalizeMessages([{ id: 'd-1', text: 'bye' }])
        api.deleteMessage.mockRejectedValueOnce(new Error('nope'))
        const { result, onDropped } = setup()
        await act(async () => {
            await result.current.remove(target, true)
        })
        expect(onDropped).not.toHaveBeenCalled()

        api.deleteMessage.mockResolvedValueOnce({})
        await act(async () => {
            await result.current.remove(target, true)
        })
        expect(api.deleteMessage).toHaveBeenLastCalledWith('d-1', true, 'acc-1')
        expect(onDropped).toHaveBeenCalledWith('d-1')
    })
})
