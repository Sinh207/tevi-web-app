/**
 * The **user room** — the realtime channel that carries things about *this account*: its balance and
 * its Premium state. CLAUDE.md's third primitive, as a transport with no opinions about React.
 *
 * Legacy's equivalent is `libs/socket/roomUser.js`. This is a rewrite rather than a port; four of its
 * behaviours are bugs that the shape below exists to make impossible.
 *
 * ## 1. Disconnecting must not unsubscribe anybody
 *
 * Legacy's `disconnect()` calls `eventListeners.clear()`. Its consumers subscribe once from a
 * `useEffect` that never re-runs, so **after the first disconnect nothing is listening again** — the
 * socket reconnects and delivers events into an empty map. Here subscriptions live outside the
 * connection: `on()` returns an unsubscribe function and is the *only* thing that can remove one.
 * Connect and disconnect move the wire underneath them.
 *
 * ## 2. An auth failure must not end the session
 *
 * Legacy answers `connect_error` with `AuthModel.revokeData()` and an immediate re-init — it **signs
 * the user out** over a transient socket error, then reconnects with the token it just deleted. This
 * transport touches no auth state at all. It reports the failure and stops; deciding what a dead
 * credential means belongs to the axios layer, which already owns it (`handleDeadAccount`).
 *
 * ## 3. One connection, one account
 *
 * `connect(accountId)` is idempotent for the same account and a teardown-and-reconnect for a
 * different one. The account is *pinned* on the instance, so events cannot be delivered against
 * whoever happens to be active when they arrive — the same rule the API layer's per-account refresh
 * flights follow, for the same reason.
 *
 * ## 4. The token is read per attempt, not captured once
 *
 * `auth` is a **function**, so socket.io calls it on every connection *and every reconnection* and
 * gets whatever is in the store then. Legacy snapshots `AuthModel.accessToken` into `this.auth` at
 * init, so a reconnect twenty minutes later presents an expired token and fails forever. Keeping the
 * read lazy also means a refresh performed by the API layer is picked up for free.
 *
 * ## 5. Exhausted retries must not leave a socket that blocks the next attempt
 *
 * socket.io stops after `reconnectionAttempts` and then does nothing forever. Because `connect()` is
 * idempotent for the account already pinned, a socket left in that state makes **every later
 * `connect()` a no-op** — so a laptop that slept through the retry window never gets realtime back,
 * silently, for the life of the tab. Counting the attempts here and tearing down on the last one is
 * what makes a later `connect()` mean something. `RealtimeProvider` is what calls it again.
 *
 * Nothing here reaches for `socket.io-client` until `connect()` is called: the factory is injected,
 * and the singleton in `user-room-client.ts` supplies it through a dynamic import so 40KB stays out
 * of the initial bundle.
 */

/** The wire events this room forwards. */
export const USER_ROOM_EVENTS = ['balance_change', 'premium_info'] as const
export type UserRoomEvent = (typeof USER_ROOM_EVENTS)[number]

/**
 * `inbox_change` is deliberately absent.
 *
 * The server sends it and legacy forwards it, but nothing in this app reads an inbox yet — direct
 * messages are not built. A forwarded event with no consumer is the same failure the event bus's rule
 * describes from the other side: it reads as a working integration point and silently is not one. Add
 * it to `USER_ROOM_EVENTS` on the day something subscribes.
 */

export type UserRoomStatus = 'idle' | 'connecting' | 'connected' | 'disconnected' | 'error'

/** The slice of a socket.io client this module uses. Kept minimal so a test can stand one up. */
export interface SocketLike {
    connected: boolean
    on(event: string, handler: (payload?: unknown) => void): void
    disconnect(): void
}

export type IoFactory = (url: string, options: Record<string, unknown>) => SocketLike

export interface UserRoomDeps {
    io: IoFactory
    /** `${DOORMAN}/user`. */
    url: string
    /** socket.io's mount path on the gateway. */
    path: string
    /**
     * The bearer to present, read **at every connection attempt**. Returning `null` still connects
     * and lets the server reject it — a silent no-op would be indistinguishable from a working
     * socket that never delivers.
     */
    getToken: () => string | null
    /**
     * The server rejected the credential. The caller decides what that means — refresh once and
     * reconnect, or give up. This module never touches auth state itself.
     */
    onAuthError?: () => void
}

/** socket.io's own reconnection, with legacy's numbers. */
const RECONNECTION = {
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    reconnectionAttempts: 10,
    timeout: 20_000,
} as const

/**
 * Whether a connection error is the server refusing the credential, as opposed to the network being
 * unavailable.
 *
 * The two need opposite responses — a bad token will fail identically forever, so retrying is wasted;
 * a flaky network is exactly what retrying is for. socket.io flattens both into `connect_error`, and
 * the gateway's own code arrives on the error object rather than in a typed field, so this reads both
 * the numeric code legacy looks for and the message socket.io produces.
 */
export function isAuthError(error: unknown): boolean {
    if (!error || typeof error !== 'object') return false
    const candidate = error as {
        err_code?: unknown
        code?: unknown
        message?: unknown
        data?: unknown
    }
    if (candidate.err_code === 401 || candidate.code === 401) return true
    const nested = candidate.data
    if (nested && typeof nested === 'object') {
        const inner = nested as { err_code?: unknown; code?: unknown }
        if (inner.err_code === 401 || inner.code === 401) return true
    }
    return (
        typeof candidate.message === 'string' && /unauthor|forbidden|401/i.test(candidate.message)
    )
}

export interface UserRoom {
    /**
     * Open the room for one account. Idempotent for the account already connected; a different
     * account tears the connection down first.
     */
    connect(accountId: string): void
    /** Close the wire. Subscriptions survive — see the note at the top of this file. */
    disconnect(): void
    /** Subscribe to one wire event. Returns the unsubscribe. */
    on(event: UserRoomEvent, handler: (payload: unknown) => void): () => void
    status(): UserRoomStatus
    /** For `useSyncExternalStore`. */
    subscribeStatus(listener: () => void): () => void
    /** The account the wire is currently pinned to, or `null`. */
    accountId(): string | null
}

export function createUserRoom({ io, url, path, getToken, onAuthError }: UserRoomDeps): UserRoom {
    /** Handlers, keyed by wire event. **Never** cleared by a disconnect. */
    const handlers = new Map<UserRoomEvent, Set<(payload: unknown) => void>>()
    const statusListeners = new Set<() => void>()

    let socket: SocketLike | null = null
    let pinnedAccountId: string | null = null
    let status: UserRoomStatus = 'idle'
    /**
     * Consecutive failed attempts on the current socket. Counted here rather than read off
     * socket.io's Manager (`socket.io.on('reconnect_failed')`), which would mean widening `SocketLike`
     * to expose the manager and make it much harder to stand up in a test.
     */
    let failedAttempts = 0

    const setStatus = (next: UserRoomStatus) => {
        if (status === next) return
        status = next
        for (const listener of statusListeners) listener()
    }

    const dispatch = (event: UserRoomEvent, payload: unknown) => {
        const set = handlers.get(event)
        if (!set) return
        // Copied before iterating: a handler that unsubscribes itself would otherwise mutate the set
        // mid-loop and skip whichever handler happened to follow it.
        for (const handler of [...set]) handler(payload)
    }

    const teardown = () => {
        socket?.disconnect()
        socket = null
        pinnedAccountId = null
    }

    return {
        connect(accountId) {
            if (socket && pinnedAccountId === accountId) return
            // A different account: the old wire is delivering someone else's events.
            if (socket) teardown()

            pinnedAccountId = accountId
            failedAttempts = 0
            setStatus('connecting')

            const instance = io(url, {
                path,
                transports: ['websocket'],
                // Read per attempt — see note 4 at the top of this file.
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
            })

            instance.on('disconnect', () => {
                if (socket !== instance) return
                setStatus('disconnected')
            })

            instance.on('connect_error', (error?: unknown) => {
                if (socket !== instance) return
                if (isAuthError(error)) {
                    /*
                     * Terminal for this attempt: the same credential will be refused identically, so
                     * socket.io's ten retries would be ten identical refusals. Torn down here and
                     * handed to the caller, which may refresh and call `connect` again.
                     */
                    teardown()
                    setStatus('error')
                    onAuthError?.()
                    return
                }
                // Network trouble: socket.io retries on its own, so this is not terminal — until it
                // runs out, at which point nothing further will happen and the socket has to go or it
                // will swallow the next `connect()`.
                failedAttempts++
                if (failedAttempts >= RECONNECTION.reconnectionAttempts) {
                    teardown()
                    setStatus('error')
                    return
                }
                setStatus('disconnected')
            })

            for (const event of USER_ROOM_EVENTS) {
                instance.on(event, (payload?: unknown) => {
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

        status: () => status,

        subscribeStatus(listener) {
            statusListeners.add(listener)
            return () => {
                statusListeners.delete(listener)
            }
        },

        accountId: () => pinnedAccountId,
    }
}
