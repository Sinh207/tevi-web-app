// @vitest-environment jsdom
import { render } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { LiveRoomState } from './use-live-room'
import { useLiveRoom } from './use-live-room'

/**
 * **Who gets a socket, and when it closes.**
 *
 * Three claims, and each of them costs something real if it is wrong:
 *
 * 1. **A guest opens no wire.** Every visitor carries an anonymous session, so a relaxed gate is
 *    a websocket per guest — the failure the user room's doc says its own gate exists to prevent.
 * 2. **Leaving closes it.** A room left open keeps the reader in the broadcast's concurrent-viewer
 *    count, which is a number its creator is watching.
 * 3. **One refresh per account on a 401.** A refresh that itself fails must not become a
 *    reconnect loop against a room that will keep refusing.
 */
const auth = vi.hoisted(() => ({
    state: { isAuthenticated: true, activeId: 'acc-1' } as {
        isAuthenticated: boolean
        activeId: string | null
    },
}))
const connect = vi.hoisted(() => vi.fn())
const disconnect = vi.hoisted(() => vi.fn())
const configure = vi.hoisted(() => vi.fn())
const performRefresh = vi.hoisted(() => vi.fn())

vi.mock('@features/auth', () => ({ useAuth: () => auth.state }))
vi.mock('@shared/lib/api/client', () => ({ performRefresh }))
vi.mock('@shared/lib/api/token', () => ({
    getAccount: (id: string) => ({ access_token: `tok-${id}` }),
}))
vi.mock('@shared/lib/socket/live-room-client', () => ({
    configureLiveRoom: configure,
    connectLiveRoom: connect,
    disconnectLiveRoom: disconnect,
    liveRoomStatus: () => 'connected',
    onLiveRoomEvent: vi.fn(() => () => {}),
    subscribeLiveRoomStatus: () => () => {},
}))

function mount({ code = 'evt-1', enabled = true } = {}) {
    const seen: { current: LiveRoomState | null } = { current: null }
    function Probe() {
        seen.current = useLiveRoom({ code, enabled })
        return null
    }
    const view = render(<Probe />)
    return { seen, view }
}

beforeEach(() => {
    connect.mockReset()
    disconnect.mockReset()
    configure.mockReset()
    performRefresh.mockReset().mockResolvedValue('fresh')
    auth.state = { isAuthenticated: true, activeId: 'acc-1' }
})

describe('the gate', () => {
    it('joins the broadcast for a real account', () => {
        mount()
        expect(connect).toHaveBeenCalledWith('evt-1')
    })

    /** ⚠ Otherwise every anonymous visitor holds a websocket. */
    it('opens nothing for a signed-out reader', () => {
        auth.state = { isAuthenticated: false, activeId: null }
        mount()
        expect(connect).not.toHaveBeenCalled()
        expect(disconnect).toHaveBeenCalled()
    })

    /* The caller decides — a reader looking at a refusal has no room to be counted in. */
    it('opens nothing when the screen has not asked for it', () => {
        mount({ enabled: false })
        expect(connect).not.toHaveBeenCalled()
    })

    it('opens nothing without an event code', () => {
        mount({ code: '' })
        expect(connect).not.toHaveBeenCalled()
    })
})

describe('leaving', () => {
    /** A room left open keeps the reader in a count the broadcast's creator is watching. */
    it('closes the room when the screen unmounts', () => {
        const { view } = mount()
        disconnect.mockClear()
        view.unmount()
        expect(disconnect).toHaveBeenCalled()
    })

    it('closes it when the reader signs out', () => {
        const { view } = mount()
        auth.state = { isAuthenticated: false, activeId: null }
        disconnect.mockClear()
        view.rerender(<div />)
        view.unmount()
        expect(disconnect).toHaveBeenCalled()
    })
})

describe('the token', () => {
    /* Read per attempt, so a reconnection after a refresh presents the new bearer. */
    it('reads the active account’s bearer rather than capturing one', () => {
        mount()
        const { getToken } = configure.mock.calls[0][0]
        expect(getToken()).toBe('tok-acc-1')
    })

    /** One refresh per account. A failing refresh must not become a loop. */
    it('refreshes once on an auth error and reconnects', async () => {
        mount()
        const { onAuthError } = configure.mock.calls[0][0]

        onAuthError()
        onAuthError()
        onAuthError()

        expect(performRefresh).toHaveBeenCalledTimes(1)
        await vi.waitFor(() => expect(connect).toHaveBeenCalledTimes(2))
    })

    it('leaves the room closed when the refresh fails', async () => {
        performRefresh.mockRejectedValue(new Error('dead'))
        mount()
        const { onAuthError } = configure.mock.calls[0][0]

        onAuthError()
        await vi.waitFor(() => expect(performRefresh).toHaveBeenCalled())
        expect(connect).toHaveBeenCalledTimes(1)
    })
})

describe('status', () => {
    it('reports the wire as connected', () => {
        const { seen } = mount()
        expect(seen.current?.isConnected).toBe(true)
        expect(seen.current?.status).toBe('connected')
    })

    /**
     * Stable across renders, which is the whole reason it is a `useCallback`.
     *
     * A caller puts it in an effect's dependency list; a new identity each render tears the
     * subscription down and rebuilds it every frame, so the chat unsubscribes and resubscribes
     * continuously while appearing to work.
     */
    it('keeps one subscribe function across renders', () => {
        const seen: LiveRoomState[] = []
        function Probe() {
            seen.push(useLiveRoom({ code: 'evt-1' }))
            return null
        }
        const view = render(<Probe />)
        view.rerender(<Probe />)

        expect(seen.length).toBeGreaterThan(1)
        expect(seen.at(-1)?.subscribe).toBe(seen[0].subscribe)
    })
})
