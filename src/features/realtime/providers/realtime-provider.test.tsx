// @vitest-environment jsdom
import { render } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { RealtimeProvider } from './realtime-provider'

/**
 * The gate, and only the gate: **who gets a websocket.**
 *
 * Every visitor to this app carries an anonymous session, so "is there a session" is not the question —
 * and getting that wrong is not a small waste. It is a held-open websocket per anonymous visit, plus
 * 40KB of `socket.io-client` downloaded, to be told nothing: the two events the room carries are a
 * balance and a Premium state, and an anonymous account has neither.
 */

const connect = vi.hoisted(() => vi.fn())
const disconnect = vi.hoisted(() => vi.fn())
const configure = vi.hoisted(() => vi.fn())
const performRefresh = vi.hoisted(() => vi.fn())
const getAccount = vi.hoisted(() => vi.fn())
const auth = vi.hoisted(() => ({
    state: { isAuthenticated: false, activeId: null as string | null },
}))

vi.mock('@features/auth', () => ({ useAuth: () => auth.state }))
vi.mock('@shared/lib/api/client', () => ({ performRefresh }))
vi.mock('@shared/lib/api/token', () => ({ getAccount }))
vi.mock('@shared/lib/socket/user-room-client', () => ({
    configureUserRoom: configure,
    connectUserRoom: connect,
    disconnectUserRoom: disconnect,
}))

function mount() {
    return render(<RealtimeProvider>ok</RealtimeProvider>)
}

beforeEach(() => {
    connect.mockReset()
    disconnect.mockReset()
    configure.mockReset()
    performRefresh.mockReset()
    performRefresh.mockResolvedValue('fresh')
    getAccount.mockReturnValue({ access_token: 'token-1' })
    auth.state = { isAuthenticated: false, activeId: null }
})

describe('who gets a socket', () => {
    it('opens nothing for a visitor with no account', () => {
        mount()
        expect(connect).not.toHaveBeenCalled()
    })

    it('opens nothing for the anonymous session every visitor carries', () => {
        // `isAuthenticated` is already `id && !anonymous`, so an anonymous account reads as false
        // here even though it has an id — which is the whole point of gating on it.
        auth.state = { isAuthenticated: false, activeId: 'anon-1' }
        mount()
        expect(connect).not.toHaveBeenCalled()
    })

    it('opens for a real account', () => {
        auth.state = { isAuthenticated: true, activeId: 'acc-1' }
        mount()
        expect(connect).toHaveBeenCalledWith('acc-1')
    })

    it('closes when the account goes away', () => {
        auth.state = { isAuthenticated: true, activeId: 'acc-1' }
        const view = mount()
        connect.mockClear()

        auth.state = { isAuthenticated: false, activeId: 'anon-1' }
        view.rerender(<RealtimeProvider>ok</RealtimeProvider>)

        expect(disconnect).toHaveBeenCalled()
        expect(connect).not.toHaveBeenCalled()
    })

    it('re-pins to the new account on a switch', () => {
        auth.state = { isAuthenticated: true, activeId: 'acc-1' }
        const view = mount()

        auth.state = { isAuthenticated: true, activeId: 'acc-2' }
        view.rerender(<RealtimeProvider>ok</RealtimeProvider>)

        expect(connect).toHaveBeenLastCalledWith('acc-2')
    })

    it('closes on unmount', () => {
        auth.state = { isAuthenticated: true, activeId: 'acc-1' }
        mount().unmount()
        expect(disconnect).toHaveBeenCalled()
    })
})

describe('coming back to a device that slept', () => {
    it('retries when the tab becomes visible', () => {
        auth.state = { isAuthenticated: true, activeId: 'acc-1' }
        mount()
        connect.mockClear()

        document.dispatchEvent(new Event('visibilitychange'))
        // socket.io gives up after about a minute; a machine closed for an hour would otherwise never
        // get realtime back. `connect` is idempotent while the socket is alive, so this is free when
        // the room is healthy.
        expect(connect).toHaveBeenCalledWith('acc-1')
    })

    it('retries when the network comes back', () => {
        auth.state = { isAuthenticated: true, activeId: 'acc-1' }
        mount()
        connect.mockClear()

        window.dispatchEvent(new Event('online'))
        expect(connect).toHaveBeenCalledWith('acc-1')
    })

    it('does not retry for a hidden tab', () => {
        auth.state = { isAuthenticated: true, activeId: 'acc-1' }
        mount()
        connect.mockClear()

        const spy = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
        document.dispatchEvent(new Event('visibilitychange'))
        expect(connect).not.toHaveBeenCalled()
        spy.mockRestore()
    })

    it('stops listening once unmounted', () => {
        auth.state = { isAuthenticated: true, activeId: 'acc-1' }
        mount().unmount()
        connect.mockClear()

        window.dispatchEvent(new Event('online'))
        document.dispatchEvent(new Event('visibilitychange'))
        expect(connect).not.toHaveBeenCalled()
    })

    it('opens nothing for a guest, however many times the device wakes', () => {
        auth.state = { isAuthenticated: false, activeId: 'anon-1' }
        mount()

        window.dispatchEvent(new Event('online'))
        document.dispatchEvent(new Event('visibilitychange'))
        expect(connect).not.toHaveBeenCalled()
    })
})

describe('the token handed to the socket', () => {
    it('is read for the pinned account, not for whoever is active', () => {
        auth.state = { isAuthenticated: true, activeId: 'acc-1' }
        mount()

        const { getToken } = configure.mock.calls.at(-1)?.[0] ?? {}
        expect(getToken()).toBe('token-1')
        expect(getAccount).toHaveBeenCalledWith('acc-1')
    })
})

describe('a refused credential', () => {
    it('refreshes once and reconnects', async () => {
        auth.state = { isAuthenticated: true, activeId: 'acc-1' }
        mount()
        connect.mockClear()

        const { onAuthError } = configure.mock.calls.at(-1)?.[0] ?? {}
        onAuthError()
        await vi.waitFor(() => expect(connect).toHaveBeenCalledWith('acc-1'))
        expect(performRefresh).toHaveBeenCalledWith('acc-1')
    })

    it('does not refresh again for the same account', async () => {
        auth.state = { isAuthenticated: true, activeId: 'acc-1' }
        mount()

        const { onAuthError } = configure.mock.calls.at(-1)?.[0] ?? {}
        onAuthError()
        await vi.waitFor(() => expect(performRefresh).toHaveBeenCalledTimes(1))
        onAuthError()
        onAuthError()

        // A loop against a genuinely dead credential would burn a rotating refresh token per
        // attempt, which is how a socket error becomes a real sign-out.
        expect(performRefresh).toHaveBeenCalledTimes(1)
    })

    it('gives up quietly when the refresh fails, leaving the session to the API layer', async () => {
        performRefresh.mockRejectedValue(new Error('dead'))
        auth.state = { isAuthenticated: true, activeId: 'acc-1' }
        mount()
        connect.mockClear()

        const { onAuthError } = configure.mock.calls.at(-1)?.[0] ?? {}
        onAuthError()
        await vi.waitFor(() => expect(performRefresh).toHaveBeenCalled())

        expect(connect).not.toHaveBeenCalled()
    })
})
