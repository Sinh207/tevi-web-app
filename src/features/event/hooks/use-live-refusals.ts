'use client'

import { useEffect, useRef } from 'react'
import type { LiveRoomState } from './use-live-room'

/**
 * **The three refusals only the live room can raise** — removed, banned from the channel, banned.
 *
 * `lib/watch-state.ts` names `kicked-out` and `banned` as states this client could not know, and
 * the reason was that the room had not been ported. It is ported; these are the frames. Each one
 * is legacy's handler in `liveSession/hook`, and the three do three different things there, which
 * is why they are not one callback:
 *
 * | frame        | legacy                                   | here                          |
 * |--------------|------------------------------------------|-------------------------------|
 * | `kickout`    | `setIsKickout(true)` → `<Kickout/>`      | `onKickedOut` → the studio's own refusal panel |
 * | `block_user` | `setIsBlocked(true)` → `<Banned/>` page  | `onBlocked` → a card on the studio frame |
 * | `ban`        | toast the server's sentence, go home     | `onBanned(sentence)` → a card |
 *
 * ⚠ **`block_user` is not the chat's `block_chat`.** Legacy has two `isBlocked`s under one name —
 * the event's, which replaces the whole page, and the comment box's, which only disables typing —
 * and this port had only the second, in `use-live-chat.ts`. Keeping the callbacks named for what
 * they *do* is what stops that collision coming back.
 *
 * `ban` diverges on purpose: a toast in a corner while the page navigated under it was the one
 * explanation most likely to be missed, so the sentence goes to a card that stays (see
 * `EventAccountBannedPanel`).
 *
 * All three are **latches** in legacy, never reset short of a remount, and they stay latches here:
 * the caller holds the flag, and nothing in the room un-kicks a reader. Legacy also only acts when
 * the frame carries `message` — an empty frame is treated as noise — and that guard is kept, because
 * a refusal is the one frame where acting on a malformed payload costs the reader their seat.
 */
export function useLiveRefusals({
    room,
    onKickedOut,
    onBlocked,
    onBanned,
}: {
    room: LiveRoomState
    onKickedOut: () => void
    onBlocked: () => void
    /** The server's own sentence — the body of the card. */
    onBanned: (message: string) => void
}) {
    const { isConnected, subscribe } = room

    /*
     * Read through refs so a re-render with fresh callbacks does not tear down and re-register the
     * room's handlers — the effect below depends on the connection, not on the parent's closures.
     */
    const kicked = useRef(onKickedOut)
    const blocked = useRef(onBlocked)
    const banned = useRef(onBanned)
    kicked.current = onKickedOut
    blocked.current = onBlocked
    banned.current = onBanned

    useEffect(() => {
        if (!isConnected) return

        const sentence = (payload: unknown): string | null => {
            const message = (payload as { message?: unknown } | null)?.message
            return typeof message === 'string' && message.trim() ? message.trim() : null
        }

        const offs = [
            subscribe('kickout', payload => {
                if (sentence(payload)) kicked.current()
            }),
            subscribe('block_user', payload => {
                if (sentence(payload)) blocked.current()
            }),
            /*
             * The server's own sentence and a trip home — legacy's `warning(message.message, 5000)`
             * then `router.push('/')`. No fallback string: legacy acts only when the frame carries
             * one, so there is never a moment it needed its own words.
             */
            subscribe('ban', payload => {
                const text = sentence(payload)
                if (text) banned.current(text)
            }),
        ]
        return () => {
            for (const off of offs) off()
        }
    }, [isConnected, subscribe])
}
