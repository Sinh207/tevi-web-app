'use client'

import { cn } from '@shared/lib/utils'
import dynamic from 'next/dynamic'
import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { LiveLayout, LivePlayback, LivePublisher } from '../api/live-types'
import { liveTransport, spotlitPublisher } from '../api/live-types'
import { useAgoraRoom } from '../hooks/use-agora-room'
import { useCdnCamera } from '../hooks/use-cdn-camera'
import { seatArrangement, seatBoxRatio, seatBoxStyle } from '../lib/seat-layout'
import { needsChromeClearance } from '../lib/stage-clearance'
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
/** No seat has a picture — `stillOnly`'s video set, one instance so the seats do not re-render. */
const NO_VIDEO: Set<string> = new Set()

export function EventStudioStage({
    playback,
    layout,
    publishers,
    scores,
    stillOnly = false,
    onSelectPublisher,
    selectedId = null,
    fill = false,
    className,
}: {
    playback: LivePlayback | null
    layout: LiveLayout | null
    publishers: LivePublisher[]
    /** Each co-host's gift total, from `useSeatScores`. Empty with one person on camera. */
    scores?: Map<string, number>
    /**
     * **The room, without the picture** — the seats as arranged, each publisher's avatar, and no
     * media at all: no player is mounted and no Agora room joined, so every seat draws its
     * camera-off face. For a preview that has ended: the reader keeps seeing who is on stage and
     * how, which is what makes the paywall over it read as "this, once you pay" rather than an
     * empty frame.
     */
    stillOnly?: boolean
    /** A seat was pressed — passed through to the grid. */
    onSelectPublisher?: (publisher: LivePublisher) => void
    selectedId?: string | null
    /**
     * **The portrait studio's space-first stage.** One face: the seat is the whole screen — no
     * inset, no corner, no hairline, the picture `cover`-filling it. A grid: hung from the top
     * with a 4px edge and 4px between tiles, rather than centred inside the desktop's 12px inset.
     */
    fill?: boolean
    className?: string
}) {
    const transport = liveTransport(playback, publishers)
    const spotlight = Boolean(layout?.spotlight)

    const arrangement = useMemo(
        () =>
            seatArrangement({
                /*
                 * On a phone, one person on stage is one tile, whatever arrangement the room
                 * names — a multi-seat layout with one face would draw that face in half the
                 * screen beside empty seats. The full screen is what `fill` promises.
                 */
                layout: fill && publishers.length <= 1 ? 'P1' : (layout?.layout ?? null),
                publisherCount: publishers.length,
                spotlight,
            }),
        [layout?.layout, publishers.length, spotlight, fill],
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
    /*
     * The areas themselves, not just their count: two layouts with the same number of tiles still
     * move every seat, and anything painting into a seat has to hear about it.
     */
    const relayoutKey = `${arrangement.areas.join('|')}:${seated.map(p => p.id).join(',')}`

    const { videoUids } = useAgoraRoom({
        playback,
        enabled: transport === 'rtc' && !stillOnly,
        relayoutKey,
    })

    /*
     * ⚠ **On the CDN path the camera flag waits for the picture.**
     *
     * `publisher.video` comes off the room payload, which the socket updates the instant a host
     * toggles their camera — but the FLV/HLS rendition is seconds behind, by a margin the client
     * cannot know. Used as-is, the camera-off composition (the centred avatar) landed over a
     * picture that was still playing and the picture went dark only afterwards; a fixed 3s lag was
     * tried and was not enough. So the player samples its own frames (`onPictureAliveChange`) and
     * `useCdnCamera` moves the overlay only when the payload and the picture agree.
     *
     * Expressed as `videoUids`, the same contract the RTC path uses (the seats trust it over the
     * payload), so `EventStudioSeats` needs no second rule. A CDN room has one publisher by
     * definition (`liveTransport`), so one flag is the whole set. RTC is untouched: there the set
     * is what is live on the wire.
     */
    const primarySeat = seated[0] ?? null

    const [pictureAlive, setPictureAlive] = useState<boolean | null>(null)
    const cdnCamera = useCdnCamera(Boolean(primarySeat?.video), pictureAlive)
    const cdnVideoUids = useMemo(
        () => new Set(cdnCamera && primarySeat?.id ? [primarySeat.id] : []),
        [cdnCamera, primarySeat?.id],
    )

    /*
     * Whether the box has to drop below the floating chrome — `lib/stage-clearance.ts`. Measured
     * before paint (a layout effect) so the first frame is already right, and again whenever the
     * stage or a chrome plate changes size: the plates grow with the upsell, the space's name and
     * the locale, so no fixed inset can know.
     *
     * The plates are found by `data-studio-chrome`, which `EventStudioScreen` puts on its two
     * corner rows — the stage does not own them and cannot take them as props without threading
     * refs through a dynamic import. Defaults to clear, the safe side, until measured.
     */
    const rootRef = useRef<HTMLDivElement>(null)
    const ratio = seatBoxRatio(arrangement)
    const [needsClearance, setNeedsClearance] = useState(true)
    useLayoutEffect(() => {
        const root = rootRef.current
        if (!root || (transport === 'none' && !stillOnly)) return
        const plates = () =>
            Array.from(document.querySelectorAll<HTMLElement>('[data-studio-chrome]'))
        const measure = () =>
            setNeedsClearance(
                needsChromeClearance({
                    stage: root.getBoundingClientRect(),
                    ratio,
                    chrome: plates().map(plate => plate.getBoundingClientRect()),
                }),
            )
        measure()
        if (typeof ResizeObserver === 'undefined') return
        const observer = new ResizeObserver(measure)
        observer.observe(root)
        for (const plate of plates()) observer.observe(plate)
        return () => observer.disconnect()
    }, [ratio, transport, stillOnly])

    // Faces only need seats, not a stream: a still room is drawn even with nothing to play.
    if (transport === 'none' && !stillOnly) return null

    const primary = seated[0] ?? null

    return (
        <div
            ref={rootRef}
            /*
             * `container-type: size` is what `seatBoxStyle`'s `cqw`/`cqh` resolve against — the
             * stage area, not the viewport. Without it the box falls back to 0 and the stream
             * disappears, so the two are a pair and neither works alone.
             */
            className={cn(
                'relative flex size-full items-center justify-center [container-type:size]',
                /*
                 * 12px on the sides, 8px at the bottom (the tray band below adds its own 4 — so the
                 * gap under the box matches the one over it), and at the top 12px, or 64px only
                 * when the box would otherwise meet the floating chrome (`needsClearance`, above).
                 * Container units resolve against the content box, so the box fits *inside*
                 * whichever inset applies. The values live in `lib/stage-clearance.ts`.
                 */
                fill
                    ? seated.length > 1
                        ? 'items-start px-1 pt-1 pb-1'
                        : 'p-0'
                    : cn('px-3 pb-2', needsClearance ? 'pt-16' : 'pt-3'),
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
                style={
                    /*
                     * On a phone the box takes the whole band — one face edge to edge, a grid's
                     * tiles stretched to fill it (each picture `cover`s its own tile) — rather
                     * than an aspect-locked box that left the sides empty. The desktop keeps the
                     * arrangement's own aspect.
                     */
                    fill ? { width: '100%', height: '100%' } : seatBoxStyle(arrangement)
                }
            >
                <EventStudioSeats
                    arrangement={arrangement}
                    publishers={seated}
                    /*
                     * `null` on the CDN path: there is one publisher and one composited rendition, so
                     * the payload's own `video` flag is the only signal there is. On RTC the live set
                     * of uids wins over the payload — see the seat's `hasVideo` note.
                     */
                    videoUids={
                        stillOnly ? NO_VIDEO : transport === 'rtc' ? videoUids : cdnVideoUids
                    }
                    // Faces only: nothing to blur, and a blurred avatar reads as a broken image.
                    isPreview={!stillOnly && Boolean(playback?.is_preview)}
                    onSelectPublisher={onSelectPublisher}
                    selectedId={selectedId}
                    fill={fill}
                    scores={scores}
                />
                {/*
                 * ⚠ **Inside the aspect box, not beside it.** The player renders only the unmute
                 * control — it paints the video into the seat's own mount node — and that control
                 * is pinned `bottom-3 end-3`. Left as a sibling of this box it pins to the
                 * *column*, which is taller than the 9:16 stage, so the button hangs below the
                 * picture and gets clipped by the column's edge. Seen on a real broadcast.
                 */}
                {!stillOnly && transport === 'cdn' && playback && primary && (
                    <EventStudioPlayer
                        playback={playback}
                        publisher={primary}
                        mountId={`player-${primary.id}`}
                        onPictureAliveChange={setPictureAlive}
                    />
                )}
            </div>
        </div>
    )
}
