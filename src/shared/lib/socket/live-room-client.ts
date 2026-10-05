import { env } from '@shared/config/env'
import {
    createLiveRoom,
    type LiveIoFactory,
    type LiveRoom,
    type LiveRoomCommand,
    type LiveRoomEvent,
    type LiveSocketLike,
} from './live-room'

/**
 * The live room, wired to the real `socket.io-client` — the counterpart to `user-room-client.ts`
 * and deliberately the same shape.
 *
 * ## One instance, and the reason is the same as the user room's
 *
 * `CLAUDE.md`: *"Neither room is exported. A second caller of `connect` is a second lifecycle, and
 * they will disagree."* That applies here with an extra edge — two live rooms would each emit
 * `join_event`, and the server counts both, so the concurrent-viewer figure the broadcast shows
 * its own creator would be wrong.
 *
 * One at a time is also all the product needs: the studio is a `fixed inset-0` stage, so a reader
 * is in exactly one broadcast or none.
 *
 * ## Dynamically imported, and that is load-bearing
 *
 * `socket.io-client` is ~40KB and the overwhelming majority of visits never open a live room. The
 * user room's doc makes the same point about guests; here it is stronger, because even a signed-in
 * reader only pays for this if they actually walk into a broadcast.
 *
 * ## Who configures it
 *
 * `features/event`'s `useLiveRoom`, not a provider. The user room is configured by
 * `RealtimeProvider` because it lives for the whole session; this one lives for as long as one
 * screen is mounted, so the screen owns it. There is no `LiveRoomProvider` and there should not
 * be: a provider would mean every page in the app paying a context for a socket almost none of
 * them opens.
 */
let room: LiveRoom | null = null
let loading: Promise<LiveRoom> | null = null

/**
 * Bumped by every `connect`/`disconnect`, so a call that was superseded while `socket.io-client`
 * was still downloading does not land afterwards.
 *
 * Without it: a reader who opens a broadcast and navigates away inside the ~40KB download gets
 * joined to a room they have already left, and nothing closes it.
 */
let generation = 0

let hooks: { getToken: () => string | null; onAuthError: () => void } = {
    getToken: () => null,
    onAuthError: () => {},
}

export function configureLiveRoom(next: {
    getToken: () => string | null
    onAuthError: () => void
}) {
    hooks = next
}

async function ensureRoom(): Promise<LiveRoom> {
    if (room) return room
    if (!loading) {
        loading = import('socket.io-client').then(mod => {
            room = createLiveRoom({
                io: mod.io as unknown as LiveIoFactory,
                // The event namespace on the same gateway the user room uses — so the CSP's
                // existing `connect-src` entry for the doorman origin already covers it.
                url: `${env.NEXT_PUBLIC_DOORMAN_DOMAIN}/event`,
                path: '/doorman/',
                getToken: () => hooks.getToken(),
                onAuthError: () => hooks.onAuthError(),
            })
            return room
        })
    }
    return loading
}

export function connectLiveRoom(eventCode: string) {
    const intent = ++generation
    void ensureRoom().then(instance => {
        if (intent !== generation) return
        instance.connect(eventCode)
    })
}

export function disconnectLiveRoom() {
    generation++
    room?.disconnect()
}

export function onLiveRoomEvent(
    event: LiveRoomEvent,
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
 * Send a command to the room this client is currently in.
 *
 * Rejects when nothing is connected, which is the honest answer rather than queueing: a caller
 * that fires before the socket is up is asking a question of a room the reader is not in.
 */
export async function requestLiveRoom(
    command: LiveRoomCommand,
    payload?: unknown,
): Promise<unknown> {
    const instance = await ensureRoom()
    return instance.request(command, payload)
}

/** Whether the wire is up, for a screen that has to say so. */
export function liveRoomStatus(): ReturnType<LiveRoom['status']> {
    return room?.status() ?? 'idle'
}

/** Why the room refused the join, in the server's words — see `LiveRoom.refusalMessage`. */
export function liveRoomRefusalMessage(): string | null {
    return room?.refusalMessage() ?? null
}

export function subscribeLiveRoomStatus(listener: () => void): () => void {
    let off: (() => void) | null = null
    let cancelled = false
    void ensureRoom().then(instance => {
        if (cancelled) return
        off = instance.subscribeStatus(listener)
    })
    return () => {
        cancelled = true
        off?.()
    }
}

export type { LiveSocketLike }
