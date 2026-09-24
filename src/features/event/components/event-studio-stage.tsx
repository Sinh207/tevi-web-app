'use client'

import { cn } from '@shared/lib/utils'
import dynamic from 'next/dynamic'
import { useMemo } from 'react'
import type { LiveLayout, LivePlayback, LivePublisher } from '../api/live-types'
import { liveTransport, spotlitPublisher } from '../api/live-types'
import { useAgoraRoom } from '../hooks/use-agora-room'
import { seatArrangement, seatBoxStyle } from '../lib/seat-layout'
import { EventStudioSeats } from './event-studio-seats'

/**
 * **Lazy, and the stylesheet is why.**
 *
 * `event-studio-player.tsx` carries a 52KB vendor stylesheet it cannot do without (its own head
 * note says what happens when it goes missing). Imported statically it would land in this
 * screen's CSS and be paid by every reader who reaches the studio — including every refusal
 * state, every Agora room and every stream with no CDN rendition at all. Behind `next/dynamic` it
 * rides in its own chunk, requested only when `transport === 'cdn'` actually mounts it.
 *
 * `ssr: false` is truthful rather than defensive: the player touches `document` at import time,
 * and the stage is a client-only surface.
 */
const EventStudioPlayer = dynamic(
    () => import('./event-studio-player').then(m => m.EventStudioPlayer),
    { ssr: false },
)

/**
 * **The stream itself** — one seat grid, whichever way the video gets there.
 *
 * ```
 *                          ┌ 'cdn'  → EventStudioPlayer  (BytePlus, one composited rendition)
 * liveTransport(…) ────────┤
 *                          └ 'rtc'  → useAgoraRoom       (one track per co-host)
 *                                     both paint into #player-{id}
 * ```
 *
 * The two drivers are interchangeable because the **mount node is the contract**: the grid renders
 * `player-{publisher.id}` for every seat, and whichever driver is in play fills the boxes. That is
 * legacy's arrangement too — `LayoutProvider` picks between `AgoraLayout` and
 * `AlternativePlaylistLayout`, and both simply render `{children}`, which is `Seats`.
 *
 * Keeping it that way is what makes the seat chrome — the name plate, the mic state, the host
 * mark, the gift total — written **once** rather than twice, and what stops the two paths drifting
 * into two different-looking live rooms.
 *
 * ## `'none'` is a state, not a failure
 *
 * A room whose payload offers neither a playlist nor a channel has nothing to play. The stage
 * renders nothing and the caller falls back — on the studio that is the app hand-off, which is
 * true rather than a spinner that never resolves.
 */
export function EventStudioStage({
    playback,
    layout,
    publishers,
    scores,
    className,
}: {
    playback: LivePlayback | null
    layout: LiveLayout | null
    publishers: LivePublisher[]
    /** Each co-host's gift total, from `useSeatScores`. Empty with one person on camera. */
    scores?: Map<string, number>
    className?: string
}) {
    const transport = liveTransport(playback, publishers)
    const spotlight = Boolean(layout?.spotlight)

    const arrangement = useMemo(
        () =>
            seatArrangement({
                layout: layout?.layout ?? null,
                publisherCount: publishers.length,
                spotlight,
            }),
        [layout?.layout, publishers.length, spotlight],
    )

    /*
     * Spotlight collapses the grid to one tile, so the *person* in it has to be resolved too —
     * otherwise a spotlit co-host is replaced by whoever happens to be first in the list.
     */
    const seated = useMemo(() => {
        if (!spotlight) return publishers
        const one = spotlitPublisher(layout, publishers)
        return one ? [one] : []
    }, [spotlight, layout, publishers])

    /*
     * Changes whenever the grid's shape or its occupants change. Agora paints into DOM nodes that
     * React replaces on either, leaving tracks rendering into detached elements — see the hook's
     * `relayoutKey` note.
     */
    const relayoutKey = `${arrangement.areas.length}:${seated.map(p => p.id).join(',')}`

    const { videoUids } = useAgoraRoom({
        playback,
        enabled: transport === 'rtc',
        relayoutKey,
    })

    if (transport === 'none') return null

    const primary = seated[0] ?? null

    return (
        <div
            /*
             * `container-type: size` is what `seatBoxStyle`'s `cqw`/`cqh` resolve against — the
             * stage area, not the viewport. Without it the box falls back to 0 and the stream
             * disappears, so the two are a pair and neither works alone.
             */
            className={cn(
                'relative flex size-full items-center justify-center [container-type:size]',
                className,
            )}
        >
            {/*
             * The stage box, at the arrangement's own aspect — see `seatBoxAspect`. `m-auto` with
             * both caps rather than a fixed size, so it fits whichever of the two dimensions runs
             * out first and stays centred in the column either way.
             */}
            <div
                className="relative"
                /*
                 * Inline, because both values are **derived** from the arrangement — see
                 * `seatBoxStyle`, which also records why `aspect-ratio` on its own leaves this box
                 * at 0×0. Tailwind's scanner reads source text, so an interpolated `aspect-[…]`
                 * would generate no CSS either way.
                 */
                style={seatBoxStyle(arrangement)}
            >
                <EventStudioSeats
                    arrangement={arrangement}
                    publishers={seated}
                    /*
                     * `null` on the CDN path: there is one publisher and one composited rendition, so
                     * the payload's own `video` flag is the only signal there is. On RTC the live set
                     * of uids wins over the payload — see the seat's `hasVideo` note.
                     */
                    videoUids={transport === 'rtc' ? videoUids : null}
                    isPreview={Boolean(playback?.is_preview)}
                    scores={scores}
                />
                {/*
                 * ⚠ **Inside the aspect box, not beside it.** The player renders only the unmute
                 * control — it paints the video into the seat's own mount node — and that control
                 * is pinned `bottom-3 end-3`. Left as a sibling of this box it pins to the
                 * *column*, which is taller than the 9:16 stage, so the button hangs below the
                 * picture and gets clipped by the column's edge. Seen on a real broadcast.
                 */}
                {transport === 'cdn' && playback && primary && (
                    <EventStudioPlayer
                        playback={playback}
                        publisher={primary}
                        mountId={`player-${primary.id}`}
                    />
                )}
            </div>
        </div>
    )
}
