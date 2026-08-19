// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The singleton wrapper, and the one race it exists to lose safely.
 *
 * `connect()` cannot be synchronous — `socket.io-client` is loaded on demand so 40KB stays out of the
 * bundle for the guests who will never need it. That makes every connect a promise racing whatever the
 * effect that started it does next, and the case that matters is a **fast sign-out**: an account
 * appears, the effect connects, the account is gone before the import resolves. Without a generation
 * counter the socket opens *after* the disconnect that was meant to prevent it, and stays open.
 */

const io = vi.hoisted(() => vi.fn())
vi.mock('socket.io-client', () => ({ io }))

/** Fresh module state per test — the singleton is module-level by design. */
async function load() {
    vi.resetModules()
    io.mockReset()
    io.mockImplementation(() => ({
        connected: false,
        on: vi.fn(),
        disconnect: vi.fn(),
    }))
    return import('./user-room-client')
}

beforeEach(() => {
    vi.resetModules()
})

describe('connecting', () => {
    it('reaches socket.io with the gateway path', async () => {
        const mod = await load()
        mod.configureUserRoom({ getToken: () => 'token-1', onAuthError: () => {} })
        mod.connectUserRoom('acc-1')

        await vi.waitFor(() => expect(io).toHaveBeenCalled())
        const [url, options] = io.mock.calls[0] ?? []
        expect(String(url)).toMatch(/\/user$/)
        expect(options).toMatchObject({ path: '/doorman/', transports: ['websocket'] })
    })

    it('asks the configured hook for the token, not the module', async () => {
        const mod = await load()
        const getToken = vi.fn(() => 'token-9')
        mod.configureUserRoom({ getToken, onAuthError: () => {} })
        mod.connectUserRoom('acc-1')

        await vi.waitFor(() => expect(io).toHaveBeenCalled())
        const options = io.mock.calls[0]?.[1] as {
            auth: (cb: (d: { token: string }) => void) => void
        }
        let token = ''
        options.auth(d => {
            token = d.token
        })
        expect(token).toBe('token-9')
        expect(getToken).toHaveBeenCalled()
    })
})

describe('a disconnect that lands mid-import', () => {
    it('cancels the connection it was racing', async () => {
        const mod = await load()
        mod.configureUserRoom({ getToken: () => 't', onAuthError: () => {} })

        // Sign-in and sign-out inside the same tick, which is what an account switch or a fast
        // bootstrap looks like. The import has not resolved yet, so the connect is still pending.
        mod.connectUserRoom('acc-1')
        mod.disconnectUserRoom()

        // Give the pending import every chance to apply.
        await new Promise(resolve => setTimeout(resolve, 0))
        await new Promise(resolve => setTimeout(resolve, 0))

        expect(io).not.toHaveBeenCalled()
    })

    it('still connects when the disconnect came first', async () => {
        const mod = await load()
        mod.configureUserRoom({ getToken: () => 't', onAuthError: () => {} })

        mod.disconnectUserRoom()
        mod.connectUserRoom('acc-1')

        await vi.waitFor(() => expect(io).toHaveBeenCalledTimes(1))
    })
})

describe('subscribing', () => {
    it('registers once the module has loaded, and unsubscribes cleanly', async () => {
        const mod = await load()
        const handler = vi.fn()
        const off = mod.onUserRoomEvent('balance_change', handler)

        // Registered against the room even though nothing has connected — subscriptions live outside
        // the connection, so a provider mounted for a guest can subscribe and simply never fire.
        await new Promise(resolve => setTimeout(resolve, 0))
        expect(() => off()).not.toThrow()
        expect(handler).not.toHaveBeenCalled()
    })
})
