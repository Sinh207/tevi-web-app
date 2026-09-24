'use client'

import { useCallback, useEffect, useState } from 'react'
import type { LiveRoomState } from './use-live-room'

/** Who is inviting — the two fields the dialog draws. Anything else on the frame is ignored. */
export interface LiveInvitation {
    name: string | null
    avatar: string | null
}

/**
 * Read one `invitation` frame into the dialog's state, or say it ends one.
 *
 * Legacy's `useSocketPublisher` switch, exactly: `type === 'invitation'` opens it, and `accept`,
 * `decline` and anything else close it — the host withdrawing, or the reader answering from another
 * device, both arrive as one of those. `undefined` for a frame that does not say which.
 */
export function parseInvitationFrame(payload: unknown): LiveInvitation | null | undefined {
    if (!payload || typeof payload !== 'object') return undefined
    const frame = payload as { type?: unknown; name?: unknown; avatar?: unknown }
    if (typeof frame.type !== 'string') return undefined
    if (frame.type.toLowerCase() !== 'invitation') return null
    const text = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null)
    return { name: text(frame.name), avatar: text(frame.avatar) }
}

/**
 * **The host inviting this reader up on camera** — the room's `invitation` channel, the last one
 * that had no consumer.
 *
 * The web cannot take part (legacy's own dialog says so — "the participant experience isn't
 * supported on web yet"), so this only ever leads to the app. Dismissing it is local: the host is
 * not told, as legacy's close button tells nobody either.
 */
export function useLiveInvitation(room: LiveRoomState): {
    invitation: LiveInvitation | null
    dismiss: () => void
} {
    const { isConnected, subscribe } = room
    const [invitation, setInvitation] = useState<LiveInvitation | null>(null)

    useEffect(() => {
        if (!isConnected) return
        return subscribe('invitation', payload => {
            const next = parseInvitationFrame(payload)
            if (next !== undefined) setInvitation(next)
        })
    }, [isConnected, subscribe])

    const dismiss = useCallback(() => setInvitation(null), [])
    return { invitation, dismiss }
}
