import { env } from '@shared/config/env'
import {
    createUserRoom,
    type IoFactory,
    type SocketLike,
    type UserRoom,
    type UserRoomStatus,
} from './user-room'

/**
 * The app's one user-room instance, and the only place `socket.io-client` is loaded.
 *
 * ## Why the import is dynamic
 *
 * socket.io-client is ~40KB gzipped and **nobody signed out ever needs it** — the room only opens for
 * a real account, and most visits are anonymous. Legacy imports it dynamically for the same reason,
 * and that part is worth keeping.
 *
 * The cost is that `connect()` is async while its callers are effects, so it is fire-and-forget with a
 * generation counter: a `disconnect()` that lands while the import is still in flight must not be
 * overtaken by the connection it was cancelling.
 *
 * ## The token, and who is allowed to refresh it
 *
 * `getToken` reads the pinned account's stored access token **synchronously**, so socket.io picks up
 * whatever the API layer last refreshed. It does not refresh anything itself: refreshing is a
 * cross-tab, single-flight, per-account operation that `client.ts` already owns, and a second
 * implementation of it is how two of them come to disagree. When the server refuses a credential, the
 * *caller* (`RealtimeProvider`) awaits `performRefresh` and reconnects once.
 */
let room: UserRoom | null = null
let loading: Promise<UserRoom> | null = null

/**
 * Bumped by every `connect`/`disconnect`. An async connect compares it before touching the socket, so
 * an intent that has since been superseded cannot apply.
 */
let generation = 0

/** Set by `RealtimeProvider`; kept out of this module so `shared/` never reaches into a feature. */
let hooks: { getToken: () => string | null; onAuthError: () => void } = {
    getToken: () => null,
    onAuthError: () => {},
}

export function configureUserRoom(next: {
    getToken: () => string | null
    onAuthError: () => void
}) {
    hooks = next
}

async function ensureRoom(): Promise<UserRoom> {
    if (room) return room
    if (!loading) {
        loading = import('socket.io-client').then(mod => {
            room = createUserRoom({
                io: mod.io as unknown as IoFactory,
                url: `${env.NEXT_PUBLIC_DOORMAN_DOMAIN}/user`,
                // The gateway mounts socket.io here rather than at the default `/socket.io/`.
                path: '/doorman/',
                getToken: () => hooks.getToken(),
                onAuthError: () => hooks.onAuthError(),
            })
            return room
        })
    }
    return loading
}

/** Open the room for one real account. Safe to call repeatedly. */
export function connectUserRoom(accountId: string) {
    const intent = ++generation
    void ensureRoom().then(instance => {
        // Superseded while `socket.io-client` was loading.
        if (intent !== generation) return
        instance.connect(accountId)
    })
}

/** Close the room. Subscriptions survive; see `user-room.ts`. */
export function disconnectUserRoom() {
    generation++
    room?.disconnect()
}

/**
 * Subscribe before the module has loaded, and stay subscribed across reconnects.
 *
 * The subscription is registered against the room as soon as it exists, so a consumer mounted during
 * the dynamic import does not miss events that arrive after it. `SocketLike` is re-exported for tests.
 */
export function onUserRoomEvent(
    event: Parameters<UserRoom['on']>[0],
    handler: (payload: unknown) => void,
): () => void {
    let off: (() => void) | null = null
    let cancelled = false

    void ensureRoom().then(instance => {
        if (cancelled) return
        off = instance.on(event, handler)
    })

    return () => {
        cancelled = true
        off?.()
    }
}

/**
 * Follow the room's connection status — told only when it **changes** (plus, with `immediate`, where
 * it stands on attach), so a listener can tell a reconnect (`disconnected` → `connected`) from the
 * first connect. Same lazy attach as
 * `onUserRoomEvent`: nothing loads `socket.io-client` that would not have loaded anyway.
 */
export function onUserRoomStatus(
    listener: (status: UserRoomStatus) => void,
    { immediate = false }: { immediate?: boolean } = {},
): () => void {
    let off: (() => void) | null = null
    let cancelled = false

    void ensureRoom().then(instance => {
        if (cancelled) return
        let last = instance.status()
        // A reader of the *state* (a banner) needs where it stands now; a reader of *changes*
        // (`useSocketReconnect`) must not be told about a connect it did not see happen.
        if (immediate) listener(last)
        off = instance.subscribeStatus(() => {
            const next = instance.status()
            if (next === last) return
            last = next
            listener(next)
        })
    })

    return () => {
        cancelled = true
        off?.()
    }
}

export type { SocketLike, UserRoomStatus }
