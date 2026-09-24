'use client'

import { env } from '@shared/config/env'
import { useEffect, useRef, useState } from 'react'
import type { LivePlayback } from '../api/live-types'

/**
 * **The RTC half of the player** — join a live room as an audience member and play what the
 * co-hosts publish.
 *
 * `liveTransport` picks this over the CDN path whenever a room has more than one publisher; see
 * `api/live-types.ts`. The difference is not a preference: the CDN rendition is a **composited
 * mix**, one video of everybody, and the seat grid needs each person's track separately.
 *
 * ## What it does, in order
 *
 * ```
 * import the SDK          ← dynamically, inside the effect
 * createClient(live, vp8)
 * setClientRole('audience', { level: 1 })   ← low latency, never a publisher
 * join(appId, live_channel, viewer_token, viewer_id)
 * on user-published   → subscribe, then play into #player-{uid}
 * on user-unpublished → stop
 * ```
 *
 * `level: 1` is legacy's and it is the ultra-low-latency audience role, which is the point of
 * being on RTC at all rather than pulling the mix.
 *
 * ## Three things legacy does that this does not
 *
 * **No beauty extension.** Legacy imports `agora-extension-beauty-effect`, registers it and
 * creates a processor — then never attaches it to anything, because a processor beautifies a track
 * *you publish* and this client is audience-only. It is a whole extra SDK downloaded on every live
 * room to build an object nobody reads.
 *
 * **The cleanup actually removes the handlers it added.** Legacy's `off('user-published', …)`
 * passes `handleUserPublished`, but the handler it registered was an inline arrow that closes over
 * it — a different function object, so `off` matches nothing and every remount leaves its
 * listeners attached to a client it then abandons.
 *
 * **`remoteUsers` is not mirrored into React state.** Legacy keeps a `{ [uid]: user }` object and
 * mutates it with `delete` inside a `setState` updater, returning the *same* reference — so the
 * re-render it is asking for never happens. Nothing reads that state anyway. What this hook
 * publishes instead is the set of uids currently sending **video**, which is the one thing the
 * seat grid genuinely needs: a tile whose person has their camera off draws an avatar, not a
 * black rectangle.
 *
 * ## The mount nodes are not this hook's
 *
 * Agora plays into a DOM id (`player-{uid}`), and those nodes belong to `EventStudioSeats`. That
 * is why this takes no refs: by the time a `user-published` frame arrives the grid has long since
 * rendered, and a publisher who joins later re-renders it before their track is played, because
 * the room payload is what listed them. The one case that needs care is a re-layout — see the
 * `replay` effect.
 */
export interface AgoraRoomState {
    /** Uids currently publishing **video**. A seat not in here draws its avatar instead. */
    videoUids: Set<string>
    /** The join failed, or the SDK could not be configured. The stage falls back. */
    hasFailed: boolean
}

type MinimalTrack = { play: (node: string, opts?: unknown) => void; stop: () => void }
type MinimalUser = { uid: string | number; videoTrack?: MinimalTrack; audioTrack?: MinimalTrack }

export function useAgoraRoom({
    playback,
    enabled,
    /**
     * Bumped by the caller whenever the **grid** changes shape.
     *
     * Agora paints into a DOM node, and React replacing that node — which a layout change does —
     * leaves the video playing into an element no longer in the document. Legacy re-plays every
     * remote track on `[layout]` for the same reason; this takes the trigger as a value so the
     * hook does not have to know what a layout is.
     */
    relayoutKey,
}: {
    playback: LivePlayback | null
    enabled: boolean
    relayoutKey: string
}): AgoraRoomState {
    const [videoUids, setVideoUids] = useState<Set<string>>(() => new Set())
    const [hasFailed, setHasFailed] = useState(false)
    const clientRef = useRef<{
        leave: () => Promise<unknown>
        removeAllListeners: () => void
        remoteUsers: MinimalUser[]
    } | null>(null)

    const appId = env.NEXT_PUBLIC_AGORA_APP_ID
    const channel = playback?.live_channel ?? null
    const token = playback?.viewer_token ?? null
    const viewerId = playback?.viewer_id ?? null

    useEffect(() => {
        if (!enabled || !appId || !channel) return

        let cancelled = false

        void (async () => {
            const { default: AgoraRTC } = await import('agora-rtc-sdk-ng')
            if (cancelled) return

            // 4 is `NONE`. The SDK logs a paragraph per frame at its default level, which on a
            // live broadcast is a console nobody else can use.
            AgoraRTC.setLogLevel(4)

            const client = AgoraRTC.createClient({ mode: 'live', codec: 'vp8' })
            clientRef.current = client as never

            client.on('user-published', async (user, mediaType) => {
                try {
                    await client.subscribe(user, mediaType)
                } catch {
                    // A subscribe can lose a race against the publisher leaving. That is not a
                    // room failure and must not take the whole stage down.
                    return
                }
                const u = user as unknown as MinimalUser
                if (mediaType === 'audio') u.audioTrack?.play('')
                if (mediaType === 'video') {
                    u.videoTrack?.play(`player-${u.uid}`, { fit: 'cover', mirror: false })
                    setVideoUids(prev => new Set(prev).add(String(u.uid)))
                }
            })

            client.on('user-unpublished', (user, mediaType) => {
                const u = user as unknown as MinimalUser
                if (mediaType === 'audio') u.audioTrack?.stop()
                if (mediaType === 'video') {
                    u.videoTrack?.stop()
                    setVideoUids(prev => {
                        // A **new** Set. Mutating and returning the same reference is the bug
                        // legacy has here, and its symptom is a tile that keeps showing video
                        // that has stopped.
                        const next = new Set(prev)
                        next.delete(String(u.uid))
                        return next
                    })
                }
            })

            try {
                await client.setClientRole('audience', { level: 1 })
                await client.join(appId, channel, token ?? null, viewerId ?? null)
            } catch {
                if (!cancelled) setHasFailed(true)
            }
        })()

        return () => {
            cancelled = true
            const client = clientRef.current
            clientRef.current = null
            if (!client) return
            /*
             * `removeAllListeners`, not `off(name, handler)`. The handlers above are inline
             * closures, so there is no reference to pass — which is exactly why legacy's `off`
             * calls match nothing and leak a listener set per remount.
             */
            client.removeAllListeners()
            void client.leave()
            setVideoUids(new Set())
        }
        // `appId` is absent: it is a `NEXT_PUBLIC_*` value Next inlines at build
        // time, so it is a literal by the time this runs and can never change.
    }, [enabled, channel, token, viewerId])

    /*
     * Re-play every remote track after the grid has changed shape.
     *
     * The mount nodes are React's, and a layout change replaces them — so a track that was playing
     * into `#player-42` is now painting into a detached element. Nothing throws and the tile is
     * simply black. Legacy does the same thing keyed on `[layout]`.
     */
    // biome-ignore lint/correctness/useExhaustiveDependencies: `relayoutKey` is the trigger.
    useEffect(() => {
        const client = clientRef.current
        if (!client) return
        for (const user of client.remoteUsers) {
            user.videoTrack?.play(`player-${user.uid}`, { fit: 'cover', mirror: false })
        }
    }, [relayoutKey])

    return { videoUids, hasFailed }
}
