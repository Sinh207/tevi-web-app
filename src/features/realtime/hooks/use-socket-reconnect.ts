'use client'

import { onUserRoomStatus } from '@shared/lib/socket/user-room-client'
import { useEffect, useRef } from 'react'

/**
 * Run `handler` each time the user room comes **back** — connected again after a disconnect or an
 * error — and never on the first connect.
 *
 * It is the "you may have missed frames" signal. A socket that dropped for thirty seconds delivered
 * nothing in that window and says nothing about it afterwards, so anything kept live by frames (a
 * conversation, a badge) must ask again. Both mobile apps do exactly this on reconnect (Android
 * refetches the open conversation and its unread messages; iOS reloads the room on foreground).
 */
export function useSocketReconnect(handler: () => void) {
    const ref = useRef(handler)
    ref.current = handler

    useEffect(() => {
        let wasDown = false
        return onUserRoomStatus(status => {
            if (status === 'connected') {
                if (wasDown) ref.current()
                wasDown = false
            } else if (status === 'disconnected' || status === 'error') {
                wasDown = true
            }
        })
    }, [])
}
