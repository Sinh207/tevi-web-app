// @vitest-environment jsdom
import { act, render, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { LiveRoomState } from '../hooks/use-live-room'
import { EventGiftAnimation } from './event-gift-animation'

/**
 * **The SVGA over the stage.** Pinned: a gift frame with an animation plays it once and the layer
 * removes itself when it finishes; a frame without one, or a creator who switched effects off,
 * plays nothing.
 */
const player = vi.hoisted(() => ({
    loops: 0,
    clearsAfterStop: false,
    finished: null as null | (() => void),
    setVideoItem: vi.fn(),
    startAnimation: vi.fn(),
    stopAnimation: vi.fn(),
    clear: vi.fn(),
    onFinished(cb: () => void) {
        this.finished = cb
    },
}))
const load = vi.hoisted(() => vi.fn((_url: string, ok: (v: unknown) => void) => ok({})))
// Shaped the way a bundler hands back this UMD module: the classes under `default`.
vi.mock('svgaplayerweb', () => {
    class Parser {
        load = load
    }
    class Player {
        constructor() {
            // biome-ignore lint/correctness/noConstructorReturn: hands the test's shared double back
            return player
        }
    }
    return { default: { Parser, Player } }
})

function mount(enabled = true) {
    const handlers = new Map<string, (payload: unknown) => void>()
    const room: LiveRoomState = {
        status: 'connected',
        isConnected: true,
        subscribe: (channel, handler) => {
            handlers.set(channel, handler)
            return () => handlers.delete(channel)
        },
    }
    const view = render(<EventGiftAnimation room={room} enabled={enabled} />)
    return { handlers, view }
}

const gift = (animation?: string) => ({
    type: 'cmd',
    msg: '/give_gift',
    gift_amount: 1,
    gift_data: { id: 'g1', name: 'Rose', price: 10, animation },
    user: { id: 'u1', name: 'Ada' },
})

beforeEach(() => {
    player.startAnimation.mockClear()
    load.mockClear()
    window.matchMedia = vi.fn().mockReturnValue({ matches: false }) as never
})

describe('the gift animation', () => {
    it('plays a gift’s animation once, then removes itself', async () => {
        const { handlers, view } = mount()
        act(() => handlers.get('msg')?.(gift('https://static.tevi.dev/rose.svga')))
        await waitFor(() => expect(player.startAnimation).toHaveBeenCalledTimes(1))
        expect(load.mock.calls[0]?.[0]).toBe('https://static.tevi.dev/rose.svga')
        expect(player.loops).toBe(1)
        expect(view.queryByTestId('event-gift-animation')).not.toBeNull()

        act(() => player.finished?.())
        expect(view.queryByTestId('event-gift-animation')).toBeNull()
    })

    it('plays nothing for a gift with no animation', () => {
        const { handlers, view } = mount()
        act(() => handlers.get('msg')?.(gift()))
        expect(view.queryByTestId('event-gift-animation')).toBeNull()
    })

    it('obeys the creator’s switch', () => {
        const { handlers } = mount(false)
        expect(handlers.has('msg')).toBe(false)
    })

    it('stays still for a reader who asked for reduced motion', () => {
        window.matchMedia = vi.fn().mockReturnValue({ matches: true }) as never
        const { handlers } = mount()
        expect(handlers.has('msg')).toBe(false)
    })
})
