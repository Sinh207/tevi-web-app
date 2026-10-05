'use client'

import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef } from 'react'
import { eventKeys } from '../api/event-api'
import { liveKeys } from '../api/live-api'
import type { LiveRoomState } from './use-live-room'

/**
 * **The two frames that say the event record itself changed.**
 *
 * `data_change` and `lock` are the room telling this client that the payload behind the page is no
 * longer what it fetched — the host renamed the broadcast, switched paid chat on, or dropped the
 * paywall over a stream that was open a moment ago. Both were *declared* on the room and neither
 * had a consumer, which is the failure `live-room.ts` warns about in the other direction: a frame
 * arrives, dispatches to an empty handler set, and nothing happens.
 *
 * ⚠ **Both are signals, never sources.** `CLAUDE.md`'s rule for every socket in this app: the frame
 * says *something changed*, the query says *what*. Writing `message` into the cache would let a
 * frame with no ordering guarantee against the HTTP responses beside it move a price, a title or an
 * entitlement backwards. So this invalidates and lets `useEvent` re-ask as the reader — which also
 * means the answer carries `purchased` and `need_unlock_package`, and a socket payload never could.
 *
 * ## `updated_at` is the guard, and it is legacy's
 *
 * Both channels fire on every change the room makes, including ones this client caused. Legacy
 * compares `message.updated_at` against the last it saw and refetches only when it moved; without
 * that, a busy broadcast re-requests the event on every frame. The comparison lives in a ref rather
 * than in state: it decides whether to fetch, it is never rendered, and as state it would re-run
 * this effect on every frame it just handled.
 *
 * ## `lock` refetches **and** raises `onLocked`
 *
 * Legacy sets an `isLocked` flag *and* refetches. This once dropped the flag as redundant —
 * `watchState` derives the refusal from the refetched fields — and that was wrong in one way that
 * mattered: the refetch says `locked`, which is also what a reader arriving at a gated stream sees,
 * so the studio offered the mid-stream reader the **ten-second preview**, spent one of the device's
 * three looks on it, and pitched the stream as if they had never watched it. The fields still
 * decide *whether* the reader is outside the gate; the flag says *how they got there*.
 *
 * ## `live_status`, and the three that move the stage
 *
 * `live_status` is the same kind of frame and joins the same handler. Legacy writes `status` and
 * `ended_at` straight into its event state from the payload, which is what flips it from the
 * session to *Live ended*; here the refetch does that, and `isStudioEligible` reads the answer.
 * Without a consumer the host could end the broadcast and a reader kept watching a frozen frame.
 *
 * `layout`, `publishers_change` and `publisher_state_change` are the room's own shape — who is on
 * camera, how they are arranged, whose microphone is open. They had no consumer either, so the seat
 * grid was fixed at whatever `layout/` answered on entry: a co-host joining, the host switching to a
 * spotlight or somebody muting changed nothing until a reload. Same rule, same treatment — the
 * frame invalidates the room query and `layout/` is asked again. Legacy writes these payloads in
 * directly and records a trap while doing it: the socket's `layout` is the *whole message* where the
 * HTTP one is `result.layout`, so the two shapes are only equal if the server wraps them identically.
 * Re-reading the endpoint means there is one shape.
 */
export function useLiveEventSync({
    code,
    room,
    onLocked,
}: {
    code: string | null
    room: LiveRoomState
    /**
     * The room locked the broadcast — legacy's `setIsLocked(true)`. Raised **as well as** the
     * refetch, because the refetched payload alone cannot tell "locked mid-stream" from "arrived at
     * a gated stream": both are `locked`, and only the second may be offered a preview.
     */
    onLocked?: () => void
}) {
    const queryClient = useQueryClient()
    const { isConnected, subscribe } = room
    // Latest callback without re-subscribing the room every render.
    const onLockedRef = useRef(onLocked)
    onLockedRef.current = onLocked

    useEffect(() => {
        if (!isConnected || !code) return

        /*
         * ⚠ **One stamp per channel, not one for all three.** A single shared `lastUpdatedAt` let a
         * `lock` carrying the same `updated_at` as the `data_change` just before it — one edit, two
         * frames — be dropped as a repeat, and the lock was never seen as a lock.
         */
        const lastUpdatedAt = new Map<string, string>()

        const onChange = (channel: string) => (payload: unknown) => {
            const updatedAt = (payload as { updated_at?: unknown } | null)?.updated_at
            /*
             * A frame with no `updated_at` is honoured rather than dropped: the field is legacy's
             * de-duplication, not a required part of the contract, and refusing to refetch because
             * a payload was thinner than expected leaves the page stale forever. Only a repeat of
             * the *same* stamp is skipped.
             */
            if (typeof updatedAt === 'string') {
                if (updatedAt === lastUpdatedAt.get(channel)) return
                lastUpdatedAt.set(channel, updatedAt)
            }
            if (channel === 'lock') onLockedRef.current?.()
            void queryClient.invalidateQueries({ queryKey: eventKeys.all })
        }

        /*
         * Not de-duplicated: these frames carry no stamp, and each one is somebody on camera doing
         * something the reader should see — a missed mic toggle is a ring that lies until the next.
         * The query layer already collapses a burst of invalidations into one request in flight.
         */
        const onRoom = () => {
            void queryClient.invalidateQueries({ queryKey: [...liveKeys.all, 'room', code] })
        }

        const offs = [
            subscribe('data_change', onChange('data_change')),
            subscribe('lock', onChange('lock')),
            subscribe('live_status', onChange('live_status')),
            subscribe('layout', onRoom),
            subscribe('publishers_change', onRoom),
            subscribe('publisher_state_change', onRoom),
        ]
        return () => {
            for (const off of offs) off()
        }
    }, [isConnected, code, subscribe, queryClient])
}
