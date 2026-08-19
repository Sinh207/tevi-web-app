import { beforeEach, describe, expect, it } from 'vitest'
import { createUserRoom, isAuthError, type SocketLike, type UserRoom } from './user-room'

/**
 * The four behaviours this transport exists to guarantee, each of which legacy's `roomUser.js` gets
 * wrong. None of them is visible from a call site, and three of them only show up after a reconnect —
 * which is exactly when nobody is watching.
 */

/** A socket.io stand-in: records handlers so a test can deliver a frame. */
function fakeSocket() {
    const handlers = new Map<string, ((payload?: unknown) => void)[]>()
    const socket: SocketLike & {
        fire: (event: string, payload?: unknown) => void
        disconnected: boolean
    } = {
        connected: false,
        disconnected: false,
        on(event, handler) {
            handlers.set(event, [...(handlers.get(event) ?? []), handler])
        },
        disconnect() {
            socket.disconnected = true
        },
        fire(event, payload) {
            for (const handler of handlers.get(event) ?? []) handler(payload)
        },
    }
    return socket
}

let sockets: ReturnType<typeof fakeSocket>[]
let tokens: string[]
let authErrors: number
let room: UserRoom
let lastOptions: Record<string, unknown>

beforeEach(() => {
    sockets = []
    tokens = []
    authErrors = 0
    room = createUserRoom({
        io: (_url, options) => {
            lastOptions = options
            const socket = fakeSocket()
            sockets.push(socket)
            return socket
        },
        url: 'wss://gateway.test/user',
        path: '/doorman/',
        getToken: () => {
            tokens.push('read')
            return 'token-1'
        },
        onAuthError: () => {
            authErrors++
        },
    })
})

/** Ask socket.io's `auth` callback for credentials, the way a (re)connection attempt would. */
function readAuth(): { token: string } {
    const auth = lastOptions.auth as (cb: (data: { token: string }) => void) => void
    let captured: { token: string } = { token: '' }
    auth(data => {
        captured = data
    })
    return captured
}

describe('subscriptions outlive the connection', () => {
    it('keeps delivering after a disconnect and reconnect', () => {
        // Legacy's `disconnect()` clears its listener map, and its consumers subscribe once from an
        // effect that never re-runs — so the socket comes back and nothing is listening.
        const seen: unknown[] = []
        room.on('balance_change', payload => seen.push(payload))

        room.connect('acc-1')
        sockets[0]?.fire('balance_change', { n: 1 })

        room.disconnect()
        room.connect('acc-1')
        sockets[1]?.fire('balance_change', { n: 2 })

        expect(seen).toEqual([{ n: 1 }, { n: 2 }])
    })

    it('lets a component subscribe before the room is ever opened', () => {
        const seen: unknown[] = []
        room.on('premium_info', payload => seen.push(payload))

        room.connect('acc-1')
        sockets[0]?.fire('premium_info', { is_premium: true })

        expect(seen).toEqual([{ is_premium: true }])
    })

    it('removes only the handler that unsubscribed', () => {
        const a: unknown[] = []
        const b: unknown[] = []
        const offA = room.on('balance_change', p => a.push(p))
        room.on('balance_change', p => b.push(p))

        room.connect('acc-1')
        offA()
        sockets[0]?.fire('balance_change', { n: 1 })

        expect(a).toEqual([])
        expect(b).toEqual([{ n: 1 }])
    })

    it('delivers to every handler even when one unsubscribes itself mid-dispatch', () => {
        const order: string[] = []
        const off = room.on('balance_change', () => {
            order.push('first')
            off()
        })
        room.on('balance_change', () => order.push('second'))

        room.connect('acc-1')
        sockets[0]?.fire('balance_change', {})

        expect(order).toEqual(['first', 'second'])
    })
})

describe('one connection, pinned to one account', () => {
    it('is idempotent for the account already connected', () => {
        room.connect('acc-1')
        room.connect('acc-1')
        expect(sockets).toHaveLength(1)
        expect(room.accountId()).toBe('acc-1')
    })

    it('tears the old wire down when the account changes', () => {
        room.connect('acc-1')
        room.connect('acc-2')

        expect(sockets).toHaveLength(2)
        expect(sockets[0]?.disconnected).toBe(true)
        expect(room.accountId()).toBe('acc-2')
    })

    it('ignores frames from a connection that has been replaced', () => {
        const seen: unknown[] = []
        room.on('balance_change', p => seen.push(p))

        room.connect('acc-1')
        const stale = sockets[0]
        room.connect('acc-2')

        // The old socket is torn down but a frame already in flight can still arrive; delivering it
        // would attribute one account's balance to another.
        stale?.fire('balance_change', { n: 'stale' })
        expect(seen).toEqual([])
    })
})

describe('the token is read per attempt', () => {
    it('is not captured at connect time', () => {
        room.connect('acc-1')
        const before = tokens.length

        // Every reconnection attempt calls `auth` again, so a token refreshed in the meantime is
        // picked up. Legacy snapshots it once and reconnects forever with an expired credential.
        expect(readAuth()).toEqual({ token: 'token-1' })
        expect(tokens.length).toBeGreaterThan(before)
    })

    it('presents an empty token rather than refusing to connect', () => {
        const bare = createUserRoom({
            io: (_url, options) => {
                lastOptions = options
                const socket = fakeSocket()
                sockets.push(socket)
                return socket
            },
            url: 'wss://gateway.test/user',
            path: '/doorman/',
            getToken: () => null,
        })
        bare.connect('acc-1')
        // A silent no-op would be indistinguishable from a working socket that never delivers.
        expect(readAuth()).toEqual({ token: '' })
    })
})

describe('a refused credential', () => {
    it('stops, reports, and touches no auth state', () => {
        room.connect('acc-1')
        sockets[0]?.fire('connect_error', { err_code: 401 })

        expect(authErrors).toBe(1)
        expect(room.status()).toBe('error')
        // Torn down rather than left to retry: the same credential fails identically ten more times.
        expect(sockets[0]?.disconnected).toBe(true)
        expect(room.accountId()).toBeNull()
    })

    it('is not confused with the network being down', () => {
        room.connect('acc-1')
        sockets[0]?.fire('connect_error', { message: 'xhr poll error' })

        expect(authErrors).toBe(0)
        // Not terminal — socket.io keeps retrying, so the wire stays up.
        expect(room.status()).toBe('disconnected')
        expect(sockets[0]?.disconnected).toBe(false)
    })
})

describe('exhausted retries', () => {
    it('tears the socket down so a later connect is not a no-op', () => {
        room.connect('acc-1')
        // socket.io stops after ten attempts and then does nothing forever. A socket left in that
        // state would make every later `connect()` return early on the "already pinned" check, so the
        // room could never come back — silently, for the life of the tab.
        for (let i = 0; i < 10; i++)
            sockets[0]?.fire('connect_error', { message: 'xhr poll error' })

        expect(room.status()).toBe('error')
        expect(sockets[0]?.disconnected).toBe(true)
        expect(room.accountId()).toBeNull()

        room.connect('acc-1')
        expect(sockets).toHaveLength(2)
    })

    it('resets the count once a connection succeeds', () => {
        room.connect('acc-1')
        for (let i = 0; i < 9; i++) sockets[0]?.fire('connect_error', { message: 'timeout' })
        sockets[0]?.fire('connect')

        // A later wobble must start counting from zero, or a long-lived tab accumulates its way to a
        // teardown it never earned.
        for (let i = 0; i < 9; i++) sockets[0]?.fire('connect_error', { message: 'timeout' })
        expect(room.status()).not.toBe('error')
        expect(sockets[0]?.disconnected).toBe(false)
    })

    it('still delivers events after the room is reopened', () => {
        const seen: unknown[] = []
        room.on('balance_change', p => seen.push(p))

        room.connect('acc-1')
        for (let i = 0; i < 10; i++) sockets[0]?.fire('connect_error', { message: 'timeout' })
        room.connect('acc-1')
        sockets[1]?.fire('balance_change', { n: 1 })

        expect(seen).toEqual([{ n: 1 }])
    })
})

describe('status', () => {
    it('walks connecting → connected → idle', () => {
        const seen: string[] = []
        room.subscribeStatus(() => seen.push(room.status()))

        room.connect('acc-1')
        sockets[0]?.fire('connect')
        room.disconnect()

        expect(seen).toEqual(['connecting', 'connected', 'idle'])
    })

    it('reports idle for a disconnect with nothing open', () => {
        room.disconnect()
        expect(room.status()).toBe('idle')
    })
})

describe('isAuthError', () => {
    it('recognises the gateway’s own code, nested or not', () => {
        expect(isAuthError({ err_code: 401 })).toBe(true)
        expect(isAuthError({ code: 401 })).toBe(true)
        expect(isAuthError({ data: { err_code: 401 } })).toBe(true)
    })

    it('recognises socket.io’s message form', () => {
        expect(isAuthError({ message: 'Unauthorized' })).toBe(true)
        expect(isAuthError({ message: 'jwt expired: 401' })).toBe(true)
    })

    it('leaves transport failures alone', () => {
        expect(isAuthError({ message: 'xhr poll error' })).toBe(false)
        expect(isAuthError({ message: 'timeout' })).toBe(false)
        expect(isAuthError(null)).toBe(false)
        expect(isAuthError('nope')).toBe(false)
    })
})
