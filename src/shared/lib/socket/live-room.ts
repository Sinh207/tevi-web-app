/**
 * **The live room** — `${DOORMAN}/event`, the third socket room and the first one that is neither
 * about an account nor about a device.
 *
 * `CLAUDE.md`'s primitive 3 describes two rooms and calls them opposites: the **user room** is
 * this account's own signals and lives for the session, the **device room** is a signed-out
 * browser waiting for a QR redemption. Neither describes this one. A live room is scoped to a
 * **broadcast**: it opens when a reader walks into one, closes when they leave, and carries the
 * traffic of everybody else in it.
 *
 * ```
 *   user room     ${DOORMAN}/user     one account   · the session          · bearer
 *   device room   ${DOORMAN}/device   one browser   · while the QR is up   · no bearer
 *   live room     ${DOORMAN}/event    one broadcast · while it is on screen · bearer
 * ```
 *
 * Same host and same `path: '/doorman/'` as the user room, different namespace — so nothing new
 * has to be allowed through the CSP.
 *
 * ## Why this is a room and not a fourth kind of thing
 *
 * It obeys the rule that matters: **a socket event is a signal, never a source.** Everything here
 * either invalidates a query or drives UI that has no HTTP representation at all (a chat line, a
 * CCU tick). Nothing writes a server figure into the cache from a frame — the balance still comes
 * from `balanceKeys`, the event still comes from `eventKeys`.
 *
 * The one place that rule bends is the same place it bends for the device room: **chat messages
 * have no other source.** `get_message_history` is a socket command, not an endpoint, so the
 * transcript *is* the socket's. That is a property of the protocol rather than a shortcut.
 *
 * ## Two states here are the ones `watch-state.ts` calls unknowable
 *
 * `kickout` and `ban` are in the channel list below. Those are the two refusals the event page
 * documents as impossible to render because nothing could raise them — this is what raises them.
 * Wiring them into the studio is the point of having this file.
 */

/**
 * Every channel the event namespace publishes, as the **suffix** — the wire name is
 * `event:{code}:{suffix}`.
 *
 * Collected from every `.on()` in legacy's `liveSession` tree rather than from a spec, the same
 * way `api/live-types.ts` was. There is no schema for this namespace.
 *
 * ⚠ **A channel with no consumer is still listed.** That looks like the thing `CLAUDE.md` forbids
 * for the event bus — *"every declared event must have an emitter"* — and it is the opposite case:
 * these are not events this app declares, they are frames a server already sends. Listing one
 * costs a `socket.on` that dispatches to an empty handler set; **not** listing it means the frame
 * arrives and is silently dropped, which is how a feature gets built twice.
 */
export const LIVE_ROOM_EVENTS = [
    /** A chat line. The transcript has no HTTP source — see the note above. */
    'msg',
    /** The host pinned or unpinned a message. */
    'pinned_message',
    /** Somebody entered or left. Drives the "X has entered the live broadcast" line. */
    'attendance',
    /** Concurrent viewers. A number that changes constantly and is never authoritative. */
    'ccu',
    /** The gift leaderboard. */
    'top_stars',
    /** The event record changed — a **signal**: invalidate `eventKeys`, never write the payload. */
    'data_change',
    /** The broadcast started, paused or ended. */
    'live_status',
    /** The seat arrangement changed. */
    'layout',
    /** Who is on camera. */
    'publishers_change',
    /** A co-host's camera or microphone. */
    'publisher_state_change',
    /** This reader was invited up to be a participant. */
    'invitation',
    /** ⚠ This reader was removed from the broadcast. `watch-state.ts` calls it unknowable. */
    'kickout',
    /** ⚠ This reader was banned by the channel. Likewise. */
    'ban',
    /** The broadcast was locked behind its paywall mid-stream. */
    'lock',
    /** A user was blocked. */
    'block_user',
    /** This reader may no longer post. */
    'block_chat',
    /** …and may again. */
    'unblock_chat',
] as const

export type LiveRoomEvent = (typeof LIVE_ROOM_EVENTS)[number]

/**
 * The commands the room answers, all shaped `emit(command, eventCode, [payload], ack)` with an ack
 * of `{ err_code, data }`.
 *
 * `join_event` and `leave_event` are not in here: they are the room's own lifecycle and
 * `connect`/`disconnect` own them, so no caller can forget to join or leave twice.
 */
export const LIVE_ROOM_COMMANDS = [
    'get_message_history',
    'get_pinned_message',
    'list_publishers',
    'get_publisher_input',
    'post_message',
] as const

export type LiveRoomCommand = (typeof LIVE_ROOM_COMMANDS)[number]

export type LiveRoomStatus = 'idle' | 'connecting' | 'connected' | 'disconnected' | 'error'

/**
 * What this file needs of a socket, which is more than the user room needs.
 *
 * `emit` with an acknowledgement is the addition, and it is why this is declared here rather than
 * imported from `user-room.ts`: that room is **listen-only** by design (its own doc: a frame is a
 * signal, and the client never talks back), so widening its type would invite an `emit` into a
 * room that must not have one.
 */
export interface LiveSocketLike {
    connected: boolean
    on(event: string, handler: (payload?: unknown) => void): void
    emit(event: string, ...args: unknown[]): void
    disconnect(): void
}

export type LiveIoFactory = (url: string, options: Record<string, unknown>) => LiveSocketLike

export interface LiveRoomDeps {
    io: LiveIoFactory
    url: string
    path: string
    getToken: () => string | null
    onAuthError?: () => void
}

const RECONNECTION = {
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    reconnectionAttempts: 10,
    timeout: 20_000,
} as const

/** How long a command waits for its acknowledgement before giving up. */
const ACK_TIMEOUT_MS = 10_000

/** The shape every acknowledgement takes. `err_code: 0` is success; anything else is a refusal. */
export interface LiveAck {
    err_code?: number
    data?: unknown
    message?: string
}

export function isAuthError(error: unknown): boolean {
    if (!error || typeof error !== 'object') return false
    const c = error as { err_code?: unknown; code?: unknown; message?: unknown; data?: unknown }
    if (c.err_code === 401 || c.code === 401) return true
    const nested = c.data
    if (nested && typeof nested === 'object') {
        const inner = nested as { err_code?: unknown; code?: unknown }
        if (inner.err_code === 401 || inner.code === 401) return true
    }
    return typeof c.message === 'string' && /unauthor|forbidden|401/i.test(c.message)
}

/** A command the room refused, or never answered. Carries the code so a caller can branch. */
export class LiveRoomError extends Error {
    readonly code: number | null
    constructor(message: string, code: number | null) {
        super(message)
        this.name = 'LiveRoomError'
        this.code = code
    }
}

export interface LiveRoom {
    /** Open the wire and `join_event`. Re-entrant: the same code twice is a no-op. */
    connect(eventCode: string): void
    /** `leave_event`, then close. */
    disconnect(): void
    on(event: LiveRoomEvent, handler: (payload: unknown) => void): () => void
    /**
     * Send a command and await its acknowledgement.
     *
     * **Rejects** on a non-zero `err_code` and on silence past `ACK_TIMEOUT_MS`. Legacy checks
     * `if (res?.err_code === 0)` at every call site and writes no `else` at any of them, so a
     * refused `get_message_history` leaves the chat empty, permanently, with the room otherwise
     * working. A rejection is at least something a caller has to decide about.
     */
    request(command: LiveRoomCommand, payload?: unknown): Promise<unknown>
    status(): LiveRoomStatus
    subscribeStatus(listener: () => void): () => void
    eventCode(): string | null
}

export function createLiveRoom({ io, url, path, getToken, onAuthError }: LiveRoomDeps): LiveRoom {
    const handlers = new Map<LiveRoomEvent, Set<(payload: unknown) => void>>()
    const statusListeners = new Set<() => void>()

    let socket: LiveSocketLike | null = null
    let joinedCode: string | null = null
    let status: LiveRoomStatus = 'idle'
    let failedAttempts = 0

    const setStatus = (next: LiveRoomStatus) => {
        if (status === next) return
        status = next
        for (const listener of statusListeners) listener()
    }

    const dispatch = (event: LiveRoomEvent, payload: unknown) => {
        const set = handlers.get(event)
        if (!set) return
        // Copied before iterating: a handler that unsubscribes itself would otherwise mutate the
        // set mid-loop and skip whichever handler happened to follow it.
        for (const handler of [...set]) handler(payload)
    }

    const teardown = () => {
        /*
         * `leave_event` **before** disconnecting, and it is not politeness: the room keeps a
         * concurrent-viewer count and an attendance list, and a socket that simply drops leaves
         * the reader counted until the server times them out. Legacy emits it too, from an unmount
         * effect that does not run on a hard navigation — this at least covers every path that
         * goes through `disconnect`.
         */
        if (socket && joinedCode) socket.emit('leave_event', joinedCode, () => {})
        socket?.disconnect()
        socket = null
        joinedCode = null
    }

    return {
        connect(eventCode) {
            if (socket && joinedCode === eventCode) return
            // A different broadcast: the old wire is delivering somebody else's room.
            if (socket) teardown()

            joinedCode = eventCode
            failedAttempts = 0
            setStatus('connecting')

            const instance = io(url, {
                path,
                transports: ['websocket'],
                // Read per attempt, not captured once — a reconnection after a token refresh has
                // to present the new one. Same reasoning as the user room's note 4.
                auth: (cb: (data: { token: string }) => void) => cb({ token: getToken() ?? '' }),
                autoConnect: true,
                ...RECONNECTION,
            })
            socket = instance

            instance.on('connect', () => {
                // A late callback from a connection we already replaced must not report status for
                // the one that replaced it.
                if (socket !== instance) return
                failedAttempts = 0
                setStatus('connected')
                /*
                 * ⚠ `join_event` on **every** connect, not once after the first.
                 *
                 * socket.io reconnects transparently, and the server's room membership does not
                 * survive that — a reader whose wifi blinked would silently stop receiving chat
                 * while the socket reports itself connected. Legacy joins from a `useEffect` keyed
                 * on the socket instance, which is the same object across a reconnect, so it
                 * joins once and never again.
                 */
                instance.emit('join_event', eventCode, () => {})
            })

            instance.on('disconnect', () => {
                if (socket !== instance) return
                setStatus('disconnected')
            })

            instance.on('connect_error', (error?: unknown) => {
                if (socket !== instance) return
                if (isAuthError(error)) {
                    teardown()
                    setStatus('error')
                    onAuthError?.()
                    return
                }
                // Network trouble: socket.io retries on its own, so this is not terminal — until
                // it runs out, at which point nothing further happens and the socket has to go or
                // it will swallow the next `connect()`.
                failedAttempts++
                if (failedAttempts >= RECONNECTION.reconnectionAttempts) {
                    teardown()
                    setStatus('error')
                    return
                }
                setStatus('disconnected')
            })

            for (const event of LIVE_ROOM_EVENTS) {
                instance.on(`event:${eventCode}:${event}`, (payload?: unknown) => {
                    if (socket !== instance) return
                    dispatch(event, payload)
                })
            }
        },

        disconnect() {
            if (!socket) {
                setStatus('idle')
                return
            }
            teardown()
            setStatus('idle')
        },

        on(event, handler) {
            const set = handlers.get(event) ?? new Set()
            set.add(handler)
            handlers.set(event, set)
            return () => {
                set.delete(handler)
            }
        },

        request(command, payload) {
            const instance = socket
            const code = joinedCode
            if (!instance || !code) {
                return Promise.reject(new LiveRoomError('the live room is not connected', null))
            }

            return new Promise((resolve, reject) => {
                let settled = false
                /*
                 * A command with no answer must not hang forever. socket.io buffers an emit made
                 * while disconnected and delivers it on reconnect — so without this, a caller
                 * awaiting `get_message_history` across a dropped connection waits indefinitely
                 * and the chat shows a spinner with no way out.
                 */
                const timer = setTimeout(() => {
                    if (settled) return
                    settled = true
                    reject(new LiveRoomError(`${command} did not answer`, null))
                }, ACK_TIMEOUT_MS)

                const ack = (response?: unknown) => {
                    if (settled) return
                    settled = true
                    clearTimeout(timer)
                    const res = (response ?? {}) as LiveAck
                    if (res.err_code === 0) {
                        resolve(res.data)
                        return
                    }
                    reject(
                        new LiveRoomError(
                            res.message ?? `${command} was refused`,
                            typeof res.err_code === 'number' ? res.err_code : null,
                        ),
                    )
                }

                // `payload` is omitted rather than sent as `undefined`: the commands that take no
                // body are `emit(command, code, ack)`, and a third argument shifts the ack.
                if (payload === undefined) instance.emit(command, code, ack)
                else instance.emit(command, code, payload, ack)
            })
        },

        status: () => status,

        subscribeStatus(listener) {
            statusListeners.add(listener)
            return () => {
                statusListeners.delete(listener)
            }
        },

        eventCode: () => joinedCode,
    }
}
