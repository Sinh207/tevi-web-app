import { describe, expect, it, vi } from 'vitest'
import { type DeviceSocket, joinDeviceRoom } from './device-room'

/**
 * The four behaviours QR sign-in rests on. Three of them are invisible from the screen — a code
 * that is never answered looks exactly like a code nobody has scanned yet.
 */

function fakeSocket() {
    const handlers = new Map<string, ((payload?: unknown) => void)[]>()
    const socket: DeviceSocket & {
        emitted: [string, unknown][]
        disconnected: number
        fire: (event: string, payload?: unknown) => void
    } = {
        emitted: [],
        disconnected: 0,
        on(event, handler) {
            handlers.set(event, [...(handlers.get(event) ?? []), handler])
        },
        emit(event, ...args) {
            socket.emitted.push([event, args[0]])
        },
        disconnect() {
            socket.disconnected++
        },
        fire(event, payload) {
            for (const handler of handlers.get(event) ?? []) handler(payload)
        },
    }
    return socket
}

function open(overrides: Partial<Parameters<typeof joinDeviceRoom>[0]> = {}) {
    const socket = fakeSocket()
    const onLinked = vi.fn()
    const onUnavailable = vi.fn()
    const room = joinDeviceRoom({
        io: () => socket,
        url: 'https://doorman.test/device',
        path: '/doorman/',
        channel: 'room-1',
        onLinked,
        onUnavailable,
        ...overrides,
    })
    return { socket, room, onLinked, onUnavailable }
}

describe('joining', () => {
    it('claims the room on connect', () => {
        const { socket } = open()
        socket.fire('connect')
        expect(socket.emitted).toEqual([['join', 'room-1']])
    })

    it('claims it again after a reconnect', () => {
        // The bug this exists to prevent: legacy emits `join` once, so after any reconnect the
        // browser is no longer in the room and the approval it is waiting for cannot arrive —
        // with a perfectly healthy-looking QR still on screen.
        const { socket } = open()
        socket.fire('connect')
        socket.fire('disconnect')
        socket.fire('connect')
        expect(socket.emitted).toHaveLength(2)
    })

    it('presents no credential — the visitor is signed out', () => {
        let options: Record<string, unknown> | null = null
        open({
            io: (_url, opts) => {
                options = opts
                return fakeSocket()
            },
        })
        expect(options).not.toBeNull()
        expect(options).not.toHaveProperty('auth')
    })
})

describe('the approval', () => {
    it('forwards the session the phone sent', () => {
        const { socket, onLinked } = open()
        socket.fire('device_link_success', { access_token: 'tok' })
        expect(onLinked).toHaveBeenCalledWith({ access_token: 'tok' })
    })

    it('ignores an empty frame', () => {
        const { socket, onLinked } = open()
        socket.fire('device_link_success', undefined)
        expect(onLinked).not.toHaveBeenCalled()
    })

    it('cannot arrive after close', () => {
        const { socket, room, onLinked } = open()
        room.close()
        socket.fire('device_link_success', { access_token: 'tok' })
        expect(onLinked).not.toHaveBeenCalled()
        expect(socket.disconnected).toBe(1)
    })

    it('closes once, however often it is asked', () => {
        const { socket, room } = open()
        room.close()
        room.close()
        expect(socket.disconnected).toBe(1)
    })
})

describe('a wire that will not come back', () => {
    it('says so only once socket.io has exhausted its retries', () => {
        const { socket, onUnavailable } = open()
        for (let i = 0; i < 9; i++) socket.fire('connect_error')
        // Still retrying: reporting here would take the code away over one flaky moment.
        expect(onUnavailable).not.toHaveBeenCalled()

        socket.fire('connect_error')
        expect(onUnavailable).toHaveBeenCalledTimes(1)
        expect(socket.disconnected).toBe(1)
    })

    it('forgets the failures once a connection lands', () => {
        const { socket, onUnavailable } = open()
        for (let i = 0; i < 9; i++) socket.fire('connect_error')
        socket.fire('connect')
        for (let i = 0; i < 9; i++) socket.fire('connect_error')
        expect(onUnavailable).not.toHaveBeenCalled()
    })
})
