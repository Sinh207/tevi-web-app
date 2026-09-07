/**
 * The **device room** — the short-lived socket behind QR sign-in, and the opposite of the user room
 * in every way that matters.
 *
 * ```
 * browser                     phone (signed in)
 *   │ POST v1/device-links/ → { payload: { token }, ws_channel }
 *   │ join(ws_channel) ───────────────────────────┐
 *   │                        scans the QR, approves │
 *   │ ◀── device_link_success { access_token, … } ──┘
 * ```
 *
 * The QR the browser draws carries that `token`; the phone posts it back with its own bearer, and
 * the backend answers this socket with a fresh session for **the browser**. So the frame is not a
 * signal about data the client could refetch — it *is* the credential, and the only delivery of it.
 * That makes this the one socket in the app whose payload is read rather than treated as a nudge
 * (CLAUDE.md's "a socket event is a signal, never a source" is about server state the API also
 * serves; there is no endpoint that will hand this token over a second time).
 *
 * ## Why not `user-room.ts`
 *
 * Four reasons, and each of them is load-bearing rather than a matter of taste:
 *
 * - **Different namespace and no bearer.** `${DOORMAN}/device`, connected while the visitor is
 *   signed *out* — the whole point is that they have no session yet. The user room is pinned to an
 *   account and presents its token on every attempt.
 * - **It emits.** Membership of `ws_channel` is claimed with a `join`, so `SocketLike` (which has
 *   no `emit`) does not describe it.
 * - **Its lifetime is a dialog**, not a session. Opened when the panel mounts, closed when it
 *   unmounts, and never reused — a second open means a second device-link token, because the first
 *   one has been on screen and may have been photographed.
 * - **Nothing survives a disconnect.** The user room keeps subscriptions across reconnects because
 *   its consumers mount once and live for the tab; here the consumer *is* the connection.
 *
 * ## `join` goes on every `connect`, not once
 *
 * Legacy emits it once, immediately after construction (`libs/socket/roomDevice.js` +
 * `components/auth/btnQR`). socket.io buffers that emit until the handshake completes, so it works
 * — exactly once. After any **reconnect** the server has forgotten the room and the browser has
 * already spent its only `join`, so the QR on screen still looks fine and the approval it is
 * waiting for can no longer arrive. Re-joining on every `connect` costs one frame and removes a
 * failure that is invisible from the screen.
 *
 * `io` is injected so this is testable without a browser, the same way `user-room.ts` is; the
 * dynamic import lives in `device-room-client.ts`.
 */

/** The wire event the phone's approval arrives on. */
export const DEVICE_LINK_SUCCESS = 'device_link_success'

/** The slice of a socket.io client this module uses. Narrower than a socket, wider than `SocketLike`. */
export interface DeviceSocket {
    on(event: string, handler: (payload?: unknown) => void): void
    emit(event: string, ...args: unknown[]): void
    disconnect(): void
}

export type DeviceIoFactory = (url: string, options: Record<string, unknown>) => DeviceSocket

/** What the caller holds. There is nothing to read — the room reports through its callbacks. */
export interface DeviceRoomHandle {
    /** Idempotent. After this the callbacks can no longer fire. */
    close(): void
}

export interface JoinDeviceRoomOptions {
    io: DeviceIoFactory
    /** `${DOORMAN}/device`. */
    url: string
    /** socket.io's mount path on the gateway. */
    path: string
    /** The room id `v1/device-links/` handed out. */
    channel: string
    /** The phone approved: this payload is the browser's new session. */
    onLinked: (payload: unknown) => void
    /**
     * The wire is not going to deliver anything — socket.io has exhausted its retries. The panel
     * turns the code into a retry affordance rather than leaving a QR on screen that nothing is
     * listening behind.
     */
    onUnavailable?: () => void
}

/** socket.io's own reconnection, with the user room's numbers. */
const RECONNECTION = {
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    reconnectionAttempts: 10,
    timeout: 20_000,
} as const

export function joinDeviceRoom({
    io,
    url,
    path,
    channel,
    onLinked,
    onUnavailable,
}: JoinDeviceRoomOptions): DeviceRoomHandle {
    let closed = false
    let failedAttempts = 0

    const socket = io(url, {
        path,
        transports: ['websocket'],
        /*
         * No `auth`. The visitor is signed out — that is what they are here to fix — and legacy
         * connects this namespace without a token too. What guards the exchange is `ws_channel`
         * itself: an unguessable id the API minted for this browser, and the only thing an
         * approval is addressed to.
         */
        autoConnect: true,
        ...RECONNECTION,
    })

    socket.on('connect', () => {
        if (closed) return
        failedAttempts = 0
        // Re-claimed on every connection — see the note at the top of this file.
        socket.emit('join', channel)
    })

    socket.on(DEVICE_LINK_SUCCESS, (payload?: unknown) => {
        if (closed || !payload) return
        onLinked(payload)
    })

    socket.on('connect_error', () => {
        if (closed) return
        /*
         * Not branched on whether the gateway said 401, unlike the user room: there is no
         * credential here to be refused, so every failure is the network. socket.io retries on its
         * own until it runs out, and then does nothing for ever — which from the screen is
         * indistinguishable from a QR nobody has scanned yet. Counting to the same limit is what
         * lets the panel say so.
         */
        failedAttempts++
        if (failedAttempts < RECONNECTION.reconnectionAttempts) return
        closed = true
        socket.disconnect()
        onUnavailable?.()
    })

    return {
        close() {
            if (closed) return
            closed = true
            socket.disconnect()
        },
    }
}
