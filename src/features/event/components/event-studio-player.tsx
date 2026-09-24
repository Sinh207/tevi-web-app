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
import { useEffect, useRef, useState } from 'react'
import type { LivePlayback, LivePublisher } from '../api/live-types'
import { preferredRendition } from '../api/live-types'
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
    className?: string
}) {
    const { t } = useTranslation()
    const playerRef = useRef<{ destroy: () => void; muted: boolean } | null>(null)
    const [isMuted, setIsMuted] = useState(true)
    const [hasFailed, setHasFailed] = useState(false)

    const rendition = preferredRendition(playback)
    const url = rendition?.url ?? null
    const poster = publisher?.avatar ?? null

    useEffect(() => {
        if (!url) return
        /*
         * One lookup, no polling. The seat grid is rendered by an ancestor in this same tree, so
         * its nodes are in the document before any effect runs — React commits the DOM first.
         * Legacy polls with a 100ms `setInterval` because *its* mount node is in a sibling tree
         * it does not control, and that interval is never cleared on the success path.
         */
        const node = document.getElementById(mountId)
        if (!node) return

        let cancelled = false

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
                    // `el`, not `id` — the node is this component's, so there is nothing to look
                    // up and nothing to poll for. See the note above.
                    el: node,
                    url,
                    fallbackUrls: rendition?.fallbacks,
                    maxFallbackRound: 10,
                    poster: poster ?? undefined,
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
                     * ⚠ Legacy passes `'contain'`, which **is not in the SDK's enum**
                     * (`fill | auto | fillHeight | fillWidth | cover`) — so it has been silently
                     * ignored there and the player has always used its default. `'auto'` is the
                     * member that means what legacy was reaching for: fit the whole frame in,
                     * letterboxed, rather than cropping a portrait stream to a landscape stage.
                     */
                    videoFillMode: 'auto',
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
            } catch {
                if (!cancelled) setHasFailed(true)
            }
        })()

        return () => {
            cancelled = true
            playerRef.current?.destroy()
            playerRef.current = null
        }
        // `rendition.fallbacks` is a fresh array each render; `url` is the identity that matters.
    }, [url, poster, mountId, rendition?.fallbacks])

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
