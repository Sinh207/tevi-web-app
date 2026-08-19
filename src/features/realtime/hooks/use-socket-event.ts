'use client'

import type { UserRoomEvent } from '@shared/lib/socket/user-room'
import { onUserRoomEvent } from '@shared/lib/socket/user-room-client'
import { useEffect, useRef } from 'react'

/**
 * Subscribe to one realtime event for as long as the component is mounted.
 *
 * ## The handler is held in a ref
 *
 * So the subscription is registered **once** and does not churn when the handler's closure changes —
 * which it does on every render for any handler that reads props or context. Re-subscribing per render
 * would be harmless with this transport but pointless, and it is the kind of thing that becomes a
 * missed event the day a transport buffers.
 *
 * ## It does not care whether the room is open
 *
 * Subscriptions live outside the connection (`user-room.ts`), so a component may subscribe while the
 * socket is closed, before `socket.io-client` has even been downloaded, and still receive events once
 * it opens. That is what makes this safe to call unconditionally from a provider that is mounted for
 * guests too: for a guest the room never opens, so the handler simply never fires.
 *
 * ## Payloads arrive as `unknown`
 *
 * Deliberately. The consumer knows what its own event carries and can parse it; a shared type would be
 * this module asserting a wire contract it cannot verify. Most consumers should not read the payload at
 * all — see the note in `index.ts` about invalidating rather than trusting it.
 */
export function useSocketEvent(event: UserRoomEvent, handler: (payload: unknown) => void) {
    const ref = useRef(handler)
    ref.current = handler

    useEffect(() => onUserRoomEvent(event, payload => ref.current(payload)), [event])
}
