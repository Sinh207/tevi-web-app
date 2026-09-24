'use client'

import { useAuth } from '@features/auth'
import { performRefresh } from '@shared/lib/api/client'
import { getAccount } from '@shared/lib/api/token'
import type { LiveRoomEvent, LiveRoomStatus } from '@shared/lib/socket/live-room'
import {
    configureLiveRoom,
    connectLiveRoom,
    disconnectLiveRoom,
    liveRoomStatus,
    onLiveRoomEvent,
    subscribeLiveRoomStatus,
} from '@shared/lib/socket/live-room-client'
import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react'

/**
 * **Be in a live room for as long as this screen is.**
 *
 * The event feature's door onto `shared/lib/socket/live-room`. It is a hook rather than a provider
 * on purpose, and the reason is written up in the client: the user room lives for the session so
 * `RealtimeProvider` owns it, and this one lives for one screen, so the screen does. A
 * `LiveRoomProvider` would make every page in the app carry a context for a socket almost none of
 * them opens.
 *
 * ## Only for a real account
 *
 * Same gate the user room has, and for a stronger reason: the room's whole content is chat,
 * gifts, and being kicked out of it, none of which mean anything to a visitor who cannot post.
 * A guest watching a stream needs the video, and the video does not come through here.
 *
 * ⚠ A signed-out reader therefore gets **no CCU and no kickout**. That is not a gap to fill by
 * relaxing the gate — every visitor carries an anonymous session, so opening a socket for them is
 * a websocket per guest, which is the thing the user room's doc says the gate exists to prevent.
 *
 * ## The auth recovery is the provider's, copied deliberately
 *
 * A 401 on the wire means the bearer expired mid-broadcast. `performRefresh` then one reconnect,
 * **once per account** — the ref is what stops a refresh that itself fails from becoming a loop
 * against a room that will keep refusing.
 */
export interface LiveRoomState {
    status: LiveRoomStatus
    /** The wire is up and this reader is in the room. */
    isConnected: boolean
    /**
     * Subscribe to one of the room's channels for the life of the component.
     *
     * Stable across renders, so a caller may put it straight in an effect's dependency list
     * without the effect re-running every frame.
     */
    subscribe: (event: LiveRoomEvent, handler: (payload: unknown) => void) => () => void
}

export function useLiveRoom({
    code,
    enabled = true,
}: {
    code: string | null
    /**
     * Off unless the screen actually needs the room.
     *
     * The caller decides: a reader looking at a refusal has no room to be in, and joining one
     * would put them in the concurrent-viewer count for a broadcast they are not watching.
     */
    enabled?: boolean
}): LiveRoomState {
    const { isAuthenticated, activeId } = useAuth()
    const refreshedFor = useRef<string | null>(null)

    const active = enabled && isAuthenticated && Boolean(code) && Boolean(activeId)

    useEffect(() => {
        if (!active || !code || !activeId) {
            disconnectLiveRoom()
            refreshedFor.current = null
            return
        }

        let cancelled = false

        configureLiveRoom({
            // Read per attempt rather than captured, so a reconnection after a refresh presents
            // the new bearer — the room's own `auth` callback is what calls this.
            getToken: () => getAccount(activeId)?.access_token ?? null,
            onAuthError: () => {
                if (cancelled) return
                // Once per account. A refresh that fails must not become a reconnect loop against
                // a room that is going to keep refusing.
                if (refreshedFor.current === activeId) return
                refreshedFor.current = activeId
                performRefresh(activeId)
                    .then(() => {
                        if (!cancelled) connectLiveRoom(code)
                    })
                    .catch(() => {
                        // The session is gone. `AuthProvider` handles that; the room simply stays
                        // closed, and the studio falls back to what a signed-out reader sees.
                    })
            },
        })

        connectLiveRoom(code)

        return () => {
            cancelled = true
            /*
             * Leaves the room and closes the wire — see `teardown` in `live-room.ts`, which emits
             * `leave_event` first so the reader stops being counted. This runs on navigation and
             * on the studio closing; it cannot run on a tab being killed, which is what the
             * server's own timeout is for.
             */
            disconnectLiveRoom()
        }
    }, [active, code, activeId])

    /*
     * `useSyncExternalStore` rather than an effect mirroring into state: the status lives outside
     * React, and mirroring it is how a screen ends up rendering a stale "connecting" after the
     * socket has already settled.
     */
    const status = useSyncExternalStore(
        subscribeLiveRoomStatus,
        liveRoomStatus,
        // The server has no socket. `'idle'` is the honest answer and matches the first client
        // render, so nothing flashes.
        () => 'idle' as LiveRoomStatus,
    )

    const subscribe = useCallback(
        (event: LiveRoomEvent, handler: (payload: unknown) => void) =>
            onLiveRoomEvent(event, handler),
        [],
    )

    return {
        status,
        isConnected: status === 'connected',
        subscribe,
    }
}
