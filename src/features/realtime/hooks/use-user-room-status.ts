'use client'

import { onUserRoomStatus, type UserRoomStatus } from '@shared/lib/socket/user-room-client'
import { useEffect, useState } from 'react'

/**
 * Where this account's socket stands — `null` until the room has reported once.
 *
 * For a screen that has to **say** it is not live (the chat room's banner), not for one that acts on
 * a reconnect: that is `useSocketReconnect`, which must never fire on the first connect and so
 * cannot be built on a state.
 */
export function useUserRoomStatus(): UserRoomStatus | null {
    const [status, setStatus] = useState<UserRoomStatus | null>(null)
    useEffect(() => onUserRoomStatus(setStatus, { immediate: true }), [])
    return status
}
