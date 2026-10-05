// @vitest-environment jsdom
import { act, render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useLiveRefusals } from './use-live-refusals'
import type { LiveRoomState } from './use-live-room'

/**
 * **The three refusals only the room can raise.** The claims:
 *
 * 1. Each frame does its own thing — `kickout` is a studio panel, `block_user` a page-wide wall,
 *    `ban` a card carrying the server's sentence. One shared callback is how the two
 *    `isBlocked`s collided.
 * 2. A frame without `message` is noise. Legacy acts only when it carries one, and a refusal is the
 *    one frame where acting on a malformed payload costs the reader their seat.
 */

function mount({ isConnected = true } = {}) {
    const handlers = new Map<string, (payload: unknown) => void>()
    const room: LiveRoomState = {
        status: isConnected ? 'connected' : 'idle',
        isConnected,
        isRefused: false,
        refusalMessage: null,
        subscribe: (channel, handler) => {
            handlers.set(channel, handler)
            return () => handlers.delete(channel)
        },
    }
    const onKickedOut = vi.fn()
    const onBlocked = vi.fn()
    const onBanned = vi.fn()
    function Probe() {
        useLiveRefusals({ room, onKickedOut, onBlocked, onBanned })
        return null
    }
    render(<Probe />)
    return { handlers, onKickedOut, onBlocked, onBanned }
}

describe('live refusals', () => {
    it('raises the studio panel on `kickout`, and nothing else', () => {
        const { handlers, onKickedOut, onBlocked } = mount()
        act(() => handlers.get('kickout')?.({ message: 'Removed by the host' }))
        expect(onKickedOut).toHaveBeenCalledTimes(1)
        expect(onBlocked).not.toHaveBeenCalled()
    })

    it('raises the page-wide wall on `block_user` — not the chat’s `block_chat`', () => {
        const { handlers, onKickedOut, onBlocked } = mount()
        expect(handlers.has('block_chat')).toBe(false)
        act(() => handlers.get('block_user')?.({ message: 'Blocked' }))
        expect(onBlocked).toHaveBeenCalledTimes(1)
        expect(onKickedOut).not.toHaveBeenCalled()
    })

    it('hands the server’s own sentence to the card on `ban` — no toast, no trip home', () => {
        const { handlers, onBanned } = mount()
        act(() => handlers.get('ban')?.({ message: '  You are banned.  ' }))
        expect(onBanned).toHaveBeenCalledWith('You are banned.')
    })

    it.each(['kickout', 'block_user', 'ban'])('ignores a `%s` frame with no message', channel => {
        const { handlers, onKickedOut, onBlocked, onBanned } = mount()
        act(() => handlers.get(channel)?.({}))
        act(() => handlers.get(channel)?.({ message: '   ' }))
        expect(onKickedOut).not.toHaveBeenCalled()
        expect(onBlocked).not.toHaveBeenCalled()
        expect(onBanned).not.toHaveBeenCalled()
    })

    it('subscribes to nothing while the room is not connected', () => {
        const { handlers } = mount({ isConnected: false })
        expect(handlers.size).toBe(0)
    })
})
