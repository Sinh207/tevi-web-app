import { env } from '@shared/config/env'
import {
    type DeviceIoFactory,
    type DeviceRoomHandle,
    type JoinDeviceRoomOptions,
    joinDeviceRoom,
} from './device-room'

/**
 * Where `socket.io-client` is loaded for the device room, and where the URL is named.
 *
 * The same shape as `user-room-client.ts` and for the same reason — 40KB stays out of the bundle
 * until somebody actually presses the QR button, which on this screen is a minority of a minority.
 * The import promise is module-level so opening the panel twice in one session loads it once.
 *
 * `open()` returns its handle **synchronously** even though the import is not done. Callers are
 * effects, and an effect that has to await something cannot clean up after itself: the cleanup
 * would run before the connection existed and the socket would open behind a panel that had
 * already closed. So `close()` sets a flag the import continuation checks, and the connection that
 * lost the race is simply never made.
 */
let loading: Promise<DeviceIoFactory> | null = null

function loadIo(): Promise<DeviceIoFactory> {
    if (!loading) {
        loading = import('socket.io-client').then(mod => mod.io as unknown as DeviceIoFactory)
    }
    return loading
}

/** Join one device-link room for as long as the returned handle is open. */
export function openDeviceRoom(
    options: Omit<JoinDeviceRoomOptions, 'io' | 'url' | 'path'>,
): DeviceRoomHandle {
    let closed = false
    let room: DeviceRoomHandle | null = null

    void loadIo()
        .then(io => {
            if (closed) return
            room = joinDeviceRoom({
                ...options,
                io,
                url: `${env.NEXT_PUBLIC_DOORMAN_DOMAIN}/device`,
                // The gateway mounts socket.io here rather than at the default `/socket.io/`.
                path: '/doorman/',
            })
        })
        .catch(() => {
            /*
             * The chunk failed to load — offline, or a deploy that moved it. Reported as the same
             * thing an exhausted socket is, because from the panel they are the same thing: the
             * code on screen will never be answered.
             */
            if (!closed) options.onUnavailable?.()
        })

    return {
        close() {
            closed = true
            room?.close()
            room = null
        },
    }
}
