'use client'

/**
 * **The vendor's stylesheet, and it is not optional.**
 *
 * This import used to be deliberately absent, on the reasoning that `controls: false` meant almost
 * nothing the CSS styles is ever rendered. That is wrong, and a screenshot of a real broadcast is
 * what showed it: VePlayer is built on xgplayer, where `controls: false` suppresses the **control
 * bar** and nothing else. `start`, `loading`, `poster`, `error` and `miniplayer` are separate
 * plugins that keep rendering — and with no CSS they stack unpositioned over the video as a bare
 * spinner, a play glyph, a pause glyph, a close cross and the literal string
 * `Click and hold to drag` (the SDK's `MINI_DRAG` label).
 *
 * The cost the old note was protecting against is real, so it is paid **lazily** instead of
 * skipped: `event-studio-stage.tsx` reaches this component through `next/dynamic`, so the 52KB
 * rides in this component's own chunk and a reader who never hits the CDN transport — every
 * refusal state, every Agora room, every narrow viewport — still downloads none of it.
 *
 * `@byteplus/veplayer/live/style`, not the package root: the live-only sheet, matching the
 * live-only bundle the effect imports. The subpath ships no type declaration, hence
 * `src/types/vendor-css.d.ts`.
 */
import '@byteplus/veplayer/live/style'
import { env } from '@shared/config/env'
import { useTranslation } from '@shared/i18n/use-translation'
import { cn } from '@shared/lib/utils'
import { Icon } from '@shared/ui/icon'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { LivePlayback, LivePublisher } from '../api/live-types'
import { preferredRendition } from '../api/live-types'
import {
    createPictureTracker,
    measureSample,
    PICTURE_SAMPLE_MS,
    PICTURE_SAMPLE_SIZE,
} from '../lib/picture-activity'
import { EVENT_STUDIO_PILL } from '../lib/studio'

/**
 * **The CDN half of the player** — a solo broadcast, pulled over HTTP-FLV or HLS.
 *
 * `liveTransport` decides between this and the Agora path; see `api/live-types.ts`. This one
 * covers a stream with **one** publisher and an `alternative_playlist`, which is the ordinary case
 * and the only one the free preview ever uses.
 *
 * ## Three things legacy does that this deliberately does not
 *
 * **No DOM polling.** Legacy calls `document.querySelector('#player-{id}')`, and when it misses —
 * which it does, because the node is rendered by a sibling tree — falls back to a `setInterval`
 * at 100ms that is never cleared on the success path, plus a `setTimeout(200)` on the path that
 * hits. The mount node belongs to this component, so a ref is all that is needed. The SDK takes
 * `el` as well as `id`.
 *
 * **The licence is configured once.** Legacy calls `live.setLicenseConfig` at *module scope*, so
 * importing the file anywhere re-runs it. It is a promise, and two in flight against one global is
 * a race nobody would see until a player failed to start.
 *
 * **Fallbacks are ordered.** `preferredRendition` returns FLV first and the rest behind it, where
 * legacy passes the raw array — so its first retry is frequently the HLS rendition it had just
 * decided against.
 *
 * ## Why the SDK is imported inside an effect
 *
 * `@byteplus/veplayer` touches `document` at import time, so a static import breaks the server
 * render of the whole event page — legacy hits this too and wraps its layout in
 * `dynamic(..., { ssr: false })`. Importing it in the effect goes further: a reader who never
 * reaches a playable stream (every refusal state, every narrow viewport, every ended broadcast)
 * downloads none of it. The `/live` subpath rather than the package root, for the same reason —
 * it is the live-only bundle, without the VOD half.
 */

/**
 * Has the licence been handed to the SDK yet.
 *
 * Module scope on purpose: the licence is global to the SDK, not per player, and a second call
 * while the first is in flight is a race on a global. `'pending'` is a promise other mounts await
 * rather than re-issuing.
 */
let licensed: Promise<void> | null = null

function configureLicence(sdk: { live: { setLicenseConfig: (c: unknown) => Promise<void> } }) {
    if (licensed) return licensed
    const sign = env.NEXT_PUBLIC_BYTEPLUS_LICENSE_SIGN
    const content = env.NEXT_PUBLIC_BYTEPLUS_LICENSE_CONTENT
    /*
     * Unlicensed is a real configuration, not an error: the four player env vars are optional and
     * a deploy without them still serves every other studio state. Resolving rather than throwing
     * lets the player attempt to start and fail visibly, which is what the vendor's own error
     * overlay is for.
     */
    if (!sign || !content) {
        licensed = Promise.resolve()
        return licensed
    }
    licensed = sdk.live.setLicenseConfig({ license: { sign, content } }).catch(() => {})
    return licensed
}

export function EventStudioPlayer({
    playback,
    publisher,
    mountId,
    onPictureAliveChange,
    className,
}: {
    playback: LivePlayback
    publisher: LivePublisher | null
    /**
     * The id of the seat tile to paint into — `player-{publisher.id}`, rendered by
     * `EventStudioSeats`.
     *
     * The same contract Agora uses, and keeping the two identical is what lets one seat grid
     * serve both transports: `EventStudioSeats` draws the name plate, the mic state and the host
     * mark, and whichever driver is in play fills the box underneath. Legacy arrives at the same
     * arrangement (`LayoutProvider` wraps `Seats`, both branches render `{children}`), which is
     * why its `Player` box is empty and carries only chrome.
     */
    mountId: string
    /**
     * Whether the picture on screen is moving — `null` while unknown or unreadable. Called only on
     * a change. The stage reconciles it with the payload's camera flag; see `lib/picture-activity.ts`.
     */
    onPictureAliveChange?: (alive: boolean | null) => void
    className?: string
}) {
    const { t } = useTranslation()
    const playerRef = useRef<{ destroy: () => void; muted: boolean } | null>(null)
    const [isMuted, setIsMuted] = useState(true)
    const [hasFailed, setHasFailed] = useState(false)

    const rendition = preferredRendition(playback)
    const url = rendition?.url ?? null
    /*
     * ⚠ **The effect below must depend on values, never on a fresh object.** It destroys the player
     * and builds a new one — a black frame, a re-buffer, a muted restart — so every dependency that
     * changes identity without changing meaning is a reload the reader sees.
     *
     * - `fallbacks` is a new array on every render (`preferredRendition` sorts a copy), and this
     *   component re-renders on every chat line, CCU tick and gift. It was in the list, which
     *   rebuilt the player continuously. The joined string is the same list, compared by value.
     * - `poster` is read only when the player is built, and it is the publisher's avatar — a field
     *   of the room payload, which the socket invalidates on every seat change. A new avatar URL is
     *   not a new stream, so it is read through a ref rather than listed.
     */
    const fallbackKey = rendition?.fallbacks.join('\n') ?? ''
    const poster = publisher?.avatar ?? null
    const posterRef = useRef(poster)
    // Read through a ref so a new callback identity is never a reason to rebuild the player.
    const onAliveRef = useRef(onPictureAliveChange)
    useEffect(() => {
        onAliveRef.current = onPictureAliveChange
    }, [onPictureAliveChange])
    useEffect(() => {
        posterRef.current = poster
    }, [poster])

    /*
     * ⚠ **The player lives in a `host` of its own, and the host is moved — never rebuilt — when the
     * seat it sits in is replaced.**
     *
     * A layout switch (`P1` → `P4`, a co-host joining, spotlight on/off) gives the seats new grid
     * areas, and `EventStudioSeats` keys a seat on its area, so the `#player-{id}` node is a *new*
     * element after the switch. The player had been created straight into the old one and kept
     * painting into it, detached — the picture simply vanished. Legacy's answer is to destroy and
     * recreate the player on every `layout` change, which reconnects the stream and costs the
     * reader a second or two of black and re-buffer each time.
     *
     * Here the SDK is handed a `div` this component owns, and a layout effect re-parents it into
     * whichever node now carries the id. Moving a playing `<video>` keeps it playing: the
     * removal and the re-insertion happen in the same task (the commit and its layout effects),
     * so the media element's "removed from the document" pause never fires. No reconnect, no
     * re-buffer, and nothing for the reader to notice.
     */
    const hostRef = useRef<HTMLDivElement | null>(null)
    if (hostRef.current === null && typeof document !== 'undefined') {
        const host = document.createElement('div')
        host.style.width = '100%'
        host.style.height = '100%'
        hostRef.current = host
    }

    /*
     * After **every** commit: a lookup by id and a parent comparison
     * cost nothing, and the seat grid is not the only thing that can replace the node. Keying
     * this on a derived key is exactly how it missed a `P3` ↔ `L2` switch, whose key did not change.
     * The seats now key on the publisher, so the node normally survives a switch; this is what
     * covers it when it does not.
     */
    useLayoutEffect(() => {
        const host = hostRef.current
        const node = document.getElementById(mountId)
        if (host && node && host.parentNode !== node) node.appendChild(host)
    })

    useEffect(() => {
        const host = hostRef.current
        if (!url || !host) return
        /*
         * One lookup, no polling: the seat grid is rendered by an ancestor in this same tree, so
         * its nodes are committed before any effect runs. Legacy polls with a 100ms
         * `setInterval` because *its* mount node is in a sibling tree it does not control.
         */
        const mount = document.getElementById(mountId)
        if (!mount) return
        if (host.parentNode !== mount) mount.appendChild(host)
        const node = host

        let cancelled = false
        let sampler: ReturnType<typeof setInterval> | null = null
        let reported: boolean | null | undefined
        const report = (alive: boolean | null) => {
            if (alive === reported) return
            reported = alive
            onAliveRef.current?.(alive)
        }

        void (async () => {
            const [sdk, plugins] = await Promise.all([
                import('@byteplus/veplayer/live'),
                import('@byteplus/veplayer-plugin'),
            ])
            if (cancelled) return

            sdk.register([plugins.rtm, plugins.flv, plugins.hlsjs])
            await configureLicence(sdk as never)
            if (cancelled) return

            try {
                const player = await sdk.createLivePlayer({
                    // `el`, not `id` — the host is this component's, so there is nothing to look
                    // up, nothing to poll for, and it can follow the seat. See `hostRef`.
                    el: node,
                    url,
                    fallbackUrls: fallbackKey ? fallbackKey.split('\n') : undefined,
                    maxFallbackRound: 10,
                    poster: posterRef.current ?? undefined,
                    defaultDefinition: 'auto',
                    width: '100%',
                    height: '100%',
                    /*
                     * **Muted, always, and this is not a preference.** Every browser blocks
                     * autoplay with sound, and a player that asks for it does not start at all —
                     * the reader gets a still frame and no indication why. Muted autoplay is
                     * allowed everywhere; the unmute control below is the reader's one gesture.
                     */
                    autoplay: { muted: true },
                    // Our own chrome. The SDK's controls are a different design system.
                    controls: false,
                    /*
                     * ⚠ **`controls: false` is not "no SDK UI"** — see the stylesheet note at the
                     * head of this file. It suppresses the control bar; every other xgplayer
                     * plugin keeps rendering, and the mini player is the one that has no meaning
                     * here at all: it exists to pop the video into a draggable corner box when the
                     * page scrolls away from it, and this stage is `fixed inset-0` with nothing to
                     * scroll. Left on, its drag hint prints over the stream.
                     */
                    ignores: ['miniplayer'],
                    isLive: true,
                    loop: false,
                    closeVideoClick: true,
                    closeVideoDblclick: true,
                    /*
                     * **`cover` — the picture fills its seat, whatever shape the seat is.** The
                     * arrangement gives every seat its own box (a 9:16 solo stage, a square in a
                     * 3×3, a wide rail tile), and letterboxing into each left black bars of a
                     * different thickness on every tile. Cover crops the overflow instead, the way
                     * the Agora path already plays (`fit: 'cover'` in `use-agora-room.ts`), so the
                     * two transports frame a person the same way.
                     *
                     * Legacy passes `'contain'`, which is not in the SDK's enum
                     * (`fill | auto | fillHeight | fillWidth | cover`) and so was silently ignored.
                     * The mount node also forces `object-fit: cover` on the `<video>` — see
                     * `EventStudioSeats` — because the SDK's own sheet would otherwise have the
                     * last word.
                     */
                    videoFillMode: 'cover',
                    error: { showRefresh: true },
                    ...(env.NEXT_PUBLIC_BYTEPLUS_APP_ID
                        ? { logger: { appId: env.NEXT_PUBLIC_BYTEPLUS_APP_ID } }
                        : {}),
                })

                if (cancelled) {
                    player.destroy()
                    return
                }

                playerRef.current = player as never
                /*
                 * Only the two events that change something on screen. Legacy subscribes to
                 * fourteen and `console.log`s eleven of them, which is noise in a production
                 * console during every live broadcast.
                 */
                player.on('volumechange', (e: { muted: boolean }) => setIsMuted(e.muted))
                player.on('error', () => setHasFailed(true))

                /*
                 * **The picture, sampled.** A 24×24 downscale every 150ms, read back and handed to
                 * the tracker — what tells the stage the viewer's frame has *actually* gone still,
                 * which the payload's camera flag cannot (it is seconds ahead of the rendition).
                 *
                 * The `<video>` is looked up each tick: VePlayer may replace it on a fallback.
                 * Paused or not yet decoding is `null`, not dead — a frame that cannot move proves
                 * nothing. A `SecurityError` from `getImageData` (a rendition served without CORS)
                 * also ends in `null`, for good: the stage then falls back to a timed delay.
                 */
                const canvas = document.createElement('canvas')
                canvas.width = PICTURE_SAMPLE_SIZE
                canvas.height = PICTURE_SAMPLE_SIZE
                const ctx = canvas.getContext('2d', { willReadFrequently: true })
                const track = createPictureTracker()
                let previous: Uint8ClampedArray | null = null
                sampler = setInterval(() => {
                    const video = node.querySelector('video')
                    if (!ctx || !video || video.paused || video.readyState < 2) {
                        previous = null
                        report(null)
                        return
                    }
                    try {
                        ctx.drawImage(video, 0, 0, PICTURE_SAMPLE_SIZE, PICTURE_SAMPLE_SIZE)
                        const rgba = ctx.getImageData(
                            0,
                            0,
                            PICTURE_SAMPLE_SIZE,
                            PICTURE_SAMPLE_SIZE,
                        ).data
                        const alive = track(measureSample(rgba, previous))
                        previous = rgba
                        if (alive !== null) report(alive)
                    } catch {
                        if (sampler) clearInterval(sampler)
                        report(null)
                    }
                }, PICTURE_SAMPLE_MS)
            } catch {
                if (!cancelled) setHasFailed(true)
            }
        })()

        return () => {
            cancelled = true
            if (sampler) clearInterval(sampler)
            onAliveRef.current?.(null)
            playerRef.current?.destroy()
            playerRef.current = null
            host.replaceChildren()
            host.remove()
        }
        // Values only — see the note on `fallbackKey`.
    }, [url, fallbackKey, mountId])

    if (!url) return null

    return (
        /*
         * This component renders **no video container** — it paints into the seat's. What is left
         * is the one control the seat grid cannot own, because only the player knows whether the
         * stream is currently silent.
         */
        <div className={cn('pointer-events-none absolute inset-0', className)}>
            {/*
             * The unmute control, and it only exists while the stream is silent. Legacy renders
             * the same button in both states and then hides the whole thing behind `isMuted`, so
             * its "mute" branch is unreachable — a reader who unmutes cannot mute again.
             */}
            {isMuted && !hasFailed && (
                <button
                    type="button"
                    data-testid="event-studio-unmute"
                    onClick={() => {
                        const player = playerRef.current
                        if (!player) return
                        player.muted = false
                        setIsMuted(false)
                    }}
                    className={cn(
                        EVENT_STUDIO_PILL,
                        'pointer-events-auto absolute bottom-3 end-3 flex size-10',
                        'items-center justify-center transition-colors hover:bg-white/20',
                    )}
                >
                    <Icon name="volume-off-slash" size={20} title={t('event_studio_unmute')} />
                </button>
            )}
        </div>
    )
}
