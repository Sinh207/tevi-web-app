import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
    createLiveRoom,
    LIVE_ROOM_EVENTS,
    type LiveIoFactory,
    LiveRoomError,
    type LiveSocketLike,
} from './live-room'

/**
 * **The live room's lifecycle**, which has three failure modes that all look like a working page.
 *
 * 1. **Joined once, never rejoined.** socket.io reconnects transparently and the server's room
 *    membership does not survive it, so a blink of wifi leaves a socket that reports itself
 *    connected and delivers nothing. This is legacy's, and it is the one worth a test above all.
 * 2. **Left without leaving.** A reader who closes the tab without `leave_event` stays in the
 *    concurrent-viewer count until the server times them out.
 * 3. **A command that is refused and never reported.** Legacy writes `if (err_code === 0)` at
 *    every call site and no `else` at any of them; a refused history load is an empty chat,
 *    forever, in a room that is otherwise fine.
 */
interface FakeSocket extends LiveSocketLike {
    handlers: Map<string, ((payload?: unknown) => void)[]>
    emits: { event: string; args: unknown[] }[]
    fire(event: string, payload?: unknown): void
    /** Answer the most recent emit's acknowledgement callback. */
    ack(response: unknown, index?: number): void
    disconnected: boolean
}

function makeSocket(): FakeSocket {
    const handlers = new Map<string, ((payload?: unknown) => void)[]>()
    const emits: { event: string; args: unknown[] }[] = []
    return {
        connected: true,
        disconnected: false,
        handlers,
        emits,
        on(event, handler) {
            handlers.set(event, [...(handlers.get(event) ?? []), handler])
        },
        emit(event, ...args) {
            emits.push({ event, args })
        },
        disconnect() {
            this.disconnected = true
            this.connected = false
        },
        fire(event, payload) {
            for (const h of handlers.get(event) ?? []) h(payload)
        },
        ack(response, index = emits.length - 1) {
            const cb = emits[index]?.args.at(-1)
            if (typeof cb === 'function') (cb as (r: unknown) => void)(response)
        },
    }
}

let sockets: FakeSocket[]
let io: LiveIoFactory
let ioOptions: Record<string, unknown>[]

function room(opts: { getToken?: () => string | null; onAuthError?: () => void } = {}) {
    return createLiveRoom({
        io,
        url: 'https://doorman.test/event',
        path: '/doorman/',
        getToken: opts.getToken ?? (() => 'tok'),
        onAuthError: opts.onAuthError,
    })
}

beforeEach(() => {
    sockets = []
    ioOptions = []
    io = ((_url: string, options: Record<string, unknown>) => {
        ioOptions.push(options)
        const s = makeSocket()
        sockets.push(s)
        return s
    }) as LiveIoFactory
})

afterEach(() => {
    vi.useRealTimers()
})

describe('connecting', () => {
    it('opens one socket and joins the broadcast', () => {
        const r = room()
        r.connect('evt-1')
        expect(sockets).toHaveLength(1)
        expect(r.status()).toBe('connecting')

        sockets[0].fire('connect')
        expect(sockets[0].emits.map(e => e.event)).toContain('join_event')
        expect(sockets[0].emits[0].args[0]).toBe('evt-1')
    })

    /**
     * ⚠ **Connected means joined.** Flipping on the transport's `connect` let the chat ask for its
     * history and pin before the server had the socket in the room — both came back empty on
     * every reload.
     */
    it('reports connected only once the room acknowledges the join', () => {
        const r = room()
        r.connect('evt-1')
        sockets[0].fire('connect')
        expect(r.status()).toBe('connecting')

        sockets[0].ack({ err_code: 0 })
        expect(r.status()).toBe('connected')
    })

    /**
     * ⚠ **A refused join is not a join.** A reader the creator removed, coming back: the room
     * answers `join_event` with a non-zero code. Marked `connected` anyway, the composer took a
     * message the room then refused with a 403, and gifts stayed on — legacy gates both on this ack.
     */
    it('reports refused when the room answers the join with an error', () => {
        const r = room()
        r.connect('evt-1')
        sockets[0].fire('connect')
        sockets[0].ack({ err_code: 403, message: 'You were removed' })
        expect(r.status()).toBe('refused')
        expect(r.refusalMessage()).toBe('You were removed')

        // A later reconnect that the room does accept is a join like any other.
        sockets[0].fire('disconnect')
        sockets[0].fire('connect')
        sockets[0].ack({ err_code: 0 })
        expect(r.status()).toBe('connected')
        expect(r.refusalMessage()).toBeNull()
    })

    it('ignores the answer to a join sent before a reconnect', () => {
        const r = room()
        r.connect('evt-1')
        sockets[0].fire('connect')
        const firstJoin = sockets[0].emits.length - 1
        sockets[0].fire('disconnect')
        sockets[0].fire('connect')

        sockets[0].ack({ err_code: 0 }, firstJoin)
        expect(r.status()).toBe('connecting')
        sockets[0].ack({ err_code: 0 })
        expect(r.status()).toBe('connected')
    })

    it('stops waiting for a join that never answers', () => {
        vi.useFakeTimers()
        const r = room()
        r.connect('evt-1')
        sockets[0].fire('connect')
        expect(r.status()).toBe('connecting')

        vi.advanceTimersByTime(10_000)
        expect(r.status()).toBe('connected')
    })

    /**
     * ⚠ **The one this file exists for.** socket.io reconnects on its own and the server's room
     * membership does not survive it. Joining only on the first `connect` leaves a socket that
     * says it is connected and delivers no chat, no CCU and no kickout — the failure legacy has.
     */
    it('rejoins on every reconnect, not only the first connect', () => {
        const r = room()
        r.connect('evt-1')

        sockets[0].fire('connect')
        sockets[0].fire('disconnect')
        expect(r.status()).toBe('disconnected')
        sockets[0].fire('connect')

        const joins = sockets[0].emits.filter(e => e.event === 'join_event')
        expect(joins).toHaveLength(2)
    })

    it('is re-entrant for the same broadcast', () => {
        const r = room()
        r.connect('evt-1')
        r.connect('evt-1')
        expect(sockets).toHaveLength(1)
    })

    /* A different broadcast is a different room — the old wire is somebody else's traffic. */
    it('replaces the wire when the broadcast changes', () => {
        const r = room()
        r.connect('evt-1')
        r.connect('evt-2')
        expect(sockets).toHaveLength(2)
        expect(sockets[0].disconnected).toBe(true)
        expect(r.eventCode()).toBe('evt-2')
    })

    /** Read per attempt, so a reconnection after a token refresh presents the new one. */
    it('reads the token at each attempt rather than capturing it', () => {
        let token = 'first'
        const r = room({ getToken: () => token })
        r.connect('evt-1')

        const auth = ioOptions[0].auth as (cb: (d: { token: string }) => void) => void
        let seen = ''
        auth(d => {
            seen = d.token
        })
        expect(seen).toBe('first')

        token = 'second'
        auth(d => {
            seen = d.token
        })
        expect(seen).toBe('second')
    })
})

describe('leaving', () => {
    /** Otherwise the reader stays in the concurrent-viewer count until the server times them out. */
    it('emits leave_event before closing the socket', () => {
        const r = room()
        r.connect('evt-1')
        sockets[0].fire('connect')
        r.disconnect()

        expect(sockets[0].emits.map(e => e.event)).toContain('leave_event')
        expect(sockets[0].disconnected).toBe(true)
        expect(r.status()).toBe('idle')
        expect(r.eventCode()).toBeNull()
    })

    it('leaves the old broadcast when swapping to another', () => {
        const r = room()
        r.connect('evt-1')
        r.connect('evt-2')
        const left = sockets[0].emits.find(e => e.event === 'leave_event')
        expect(left?.args[0]).toBe('evt-1')
    })

    it('is safe to call with nothing open', () => {
        const r = room()
        r.disconnect()
        expect(r.status()).toBe('idle')
    })
})

describe('channels', () => {
    /*
     * The wire name is `event:{code}:{suffix}` and subscribers name only the suffix. Getting the
     * prefix wrong is a listener that never fires, with nothing to see.
     */
    it('subscribes with the event code in the channel name', () => {
        const r = room()
        r.connect('evt-1')
        for (const event of LIVE_ROOM_EVENTS) {
            expect(sockets[0].handlers.has(`event:evt-1:${event}`)).toBe(true)
        }
    })

    it('delivers a frame to its subscribers and stops on unsubscribe', () => {
        const r = room()
        r.connect('evt-1')
        const seen: unknown[] = []
        const off = r.on('msg', p => seen.push(p))

        sockets[0].fire('event:evt-1:msg', { text: 'hi' })
        expect(seen).toEqual([{ text: 'hi' }])

        off()
        sockets[0].fire('event:evt-1:msg', { text: 'again' })
        expect(seen).toHaveLength(1)
    })

    /*
     * A handler that unsubscribes itself must not make the set skip whichever handler follows it
     * — the dispatch copies before iterating.
     */
    it('survives a handler that unsubscribes itself mid-dispatch', () => {
        const r = room()
        r.connect('evt-1')
        const seen: string[] = []
        const off = r.on('msg', () => {
            seen.push('first')
            off()
        })
        r.on('msg', () => seen.push('second'))

        sockets[0].fire('event:evt-1:msg', {})
        expect(seen).toEqual(['first', 'second'])
    })

    /** A frame from a wire we already replaced must not reach anybody. */
    it('ignores frames from a superseded socket', () => {
        const r = room()
        r.connect('evt-1')
        const seen: unknown[] = []
        r.on('msg', p => seen.push(p))
        const stale = sockets[0]

        r.connect('evt-2')
        stale.fire('event:evt-1:msg', { text: 'ghost' })
        expect(seen).toHaveLength(0)
    })

    /**
     * ⚠ `kickout` and `ban` are the two refusals `lib/watch-state.ts` records as unknowable to
     * this client. They are knowable here, and this is the assertion that says so.
     */
    it('carries the two states the event page could not otherwise render', () => {
        const r = room()
        r.connect('evt-1')
        const seen: string[] = []
        r.on('kickout', () => seen.push('kickout'))
        r.on('ban', () => seen.push('ban'))

        sockets[0].fire('event:evt-1:kickout', {})
        sockets[0].fire('event:evt-1:ban', {})
        expect(seen).toEqual(['kickout', 'ban'])
    })
})

describe('commands', () => {
    it('resolves with the acknowledgement data', async () => {
        const r = room()
        r.connect('evt-1')
        sockets[0].fire('connect')

        const pending = r.request('get_message_history')
        sockets[0].ack({ err_code: 0, data: [{ id: 'm1' }] })
        await expect(pending).resolves.toEqual([{ id: 'm1' }])
    })

    /** No body means `emit(command, code, ack)` — a third argument would shift the callback. */
    it('omits the payload rather than sending undefined', () => {
        const r = room()
        r.connect('evt-1')
        void r.request('get_pinned_message').catch(() => {})

        const sent = sockets[0].emits.at(-1)
        expect(sent?.args).toHaveLength(2)
        expect(sent?.args[0]).toBe('evt-1')
    })

    it('sends a body when there is one', () => {
        const r = room()
        r.connect('evt-1')
        void r.request('post_message', { msg: 'hello' }).catch(() => {})

        const sent = sockets[0].emits.at(-1)
        expect(sent?.args).toHaveLength(3)
        expect(sent?.args[1]).toEqual({ msg: 'hello' })
    })

    /**
     * ⚠ A refusal **rejects**. Legacy checks `err_code === 0` and writes no `else`, so a refused
     * history load leaves the chat empty in a room that otherwise works perfectly.
     */
    it('rejects a refusal, carrying the code', async () => {
        const r = room()
        r.connect('evt-1')
        const pending = r.request('get_message_history')
        sockets[0].ack({ err_code: 403, message: 'blocked' })

        await expect(pending).rejects.toBeInstanceOf(LiveRoomError)
        await expect(pending).rejects.toMatchObject({ code: 403, message: 'blocked' })
    })

    /*
     * socket.io buffers an emit made while disconnected and delivers it on reconnect, so a
     * command across a dropped connection would otherwise wait forever — a spinner with no exit.
     */
    it('rejects when the room never answers', async () => {
        vi.useFakeTimers()
        const r = room()
        r.connect('evt-1')
        const pending = r.request('get_message_history')
        const assertion = expect(pending).rejects.toMatchObject({ code: null })
        await vi.advanceTimersByTimeAsync(10_001)
        await assertion
    })

    it('ignores a late acknowledgement after the timeout', async () => {
        vi.useFakeTimers()
        const r = room()
        r.connect('evt-1')
        const pending = r.request('get_message_history')
        const assertion = expect(pending).rejects.toThrow()
        await vi.advanceTimersByTimeAsync(10_001)
        await assertion
        // Must not throw an unhandled rejection or resolve a settled promise.
        expect(() => sockets[0].ack({ err_code: 0, data: [] })).not.toThrow()
    })

    it('rejects rather than emitting into nothing when disconnected', async () => {
        const r = room()
        await expect(r.request('get_message_history')).rejects.toBeInstanceOf(LiveRoomError)
    })
})

describe('failure', () => {
    it('reports an auth error once and closes the wire', () => {
        const onAuthError = vi.fn()
        const r = room({ onAuthError })
        r.connect('evt-1')
        sockets[0].fire('connect_error', { err_code: 401 })

        expect(onAuthError).toHaveBeenCalledTimes(1)
        expect(r.status()).toBe('error')
        expect(sockets[0].disconnected).toBe(true)
    })

    /*
     * socket.io retries on its own, so a single network error is not terminal — but once the
     * attempts run out nothing further happens, and a socket left in place swallows the next
     * `connect()`.
     */
    it('stays disconnected while retries remain, then gives up', () => {
        const r = room()
        r.connect('evt-1')
        for (let i = 0; i < 9; i++) sockets[0].fire('connect_error', {})
        expect(r.status()).toBe('disconnected')

        sockets[0].fire('connect_error', {})
        expect(r.status()).toBe('error')
        expect(sockets[0].disconnected).toBe(true)
    })

    it('can reconnect after giving up', () => {
        const r = room()
        r.connect('evt-1')
        for (let i = 0; i < 10; i++) sockets[0].fire('connect_error', {})

        r.connect('evt-1')
        expect(sockets).toHaveLength(2)
        expect(r.status()).toBe('connecting')
    })
})
