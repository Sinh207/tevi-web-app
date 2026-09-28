// @vitest-environment jsdom
import { act, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ChatAction } from '../api/types'
import { CHAT_ACTION_TTL_MS, useChatActions } from './use-chat-actions'

/** The socket, as a table of handlers the test can fire. */
const handlers = new Map<string, (payload: unknown) => void>()
vi.mock('@features/realtime', () => ({
    useSocketEvent: (event: string, handler: (payload: unknown) => void) => {
        handlers.set(event, handler)
    },
}))

function emit(event: string, payload: unknown) {
    act(() => handlers.get(event)?.(payload))
}

function setup() {
    const result: { current: ReadonlyMap<string, ChatAction> } = { current: new Map() }
    function Probe() {
        result.current = useChatActions()
        return null
    }
    render(<Probe />)
    return result
}

describe('useChatActions', () => {
    beforeEach(() => {
        vi.useFakeTimers()
        handlers.clear()
    })
    afterEach(() => {
        vi.useRealTimers()
    })

    it('shows typing for the conversation the frame names, and only that one', () => {
        const actions = setup()
        emit('change_chat_action', { conversation_id: 'a', action: 'TYPING' })
        expect(actions.current.get('a')).toBe('TYPING')
        expect(actions.current.has('b')).toBe(false)
    })

    it('clears on NONE', () => {
        const actions = setup()
        emit('change_chat_action', { conversation_id: 'a', action: 'TYPING' })
        emit('change_chat_action', { conversation_id: 'a', action: 'NONE' })
        expect(actions.current.has('a')).toBe(false)
    })

    /* The sender who closes the tab mid-word never sends NONE — legacy then says "Typing…" on that
       row until reload. */
    it('clears on its own when the NONE never comes', () => {
        const actions = setup()
        emit('change_chat_action', { conversation_id: 'a', action: 'TYPING' })
        act(() => vi.advanceTimersByTime(CHAT_ACTION_TTL_MS - 1))
        expect(actions.current.get('a')).toBe('TYPING')
        act(() => vi.advanceTimersByTime(1))
        expect(actions.current.has('a')).toBe(false)
    })

    it('restarts the timeout on every repeat, so a long message does not flicker', () => {
        const actions = setup()
        emit('change_chat_action', { conversation_id: 'a', action: 'TYPING' })
        act(() => vi.advanceTimersByTime(CHAT_ACTION_TTL_MS - 1000))
        emit('change_chat_action', { conversation_id: 'a', action: 'TYPING' })
        act(() => vi.advanceTimersByTime(CHAT_ACTION_TTL_MS - 1000))
        expect(actions.current.get('a')).toBe('TYPING')
    })

    it('ends when the message it was announcing lands', () => {
        const actions = setup()
        emit('change_chat_action', { conversation_id: 'a', action: 'UPLOADING_PHOTO' })
        emit('new_message', { conversation_id: 'a', id: 'm1' })
        expect(actions.current.has('a')).toBe(false)
    })
})
