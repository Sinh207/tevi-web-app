'use client'

import { useEffect, useRef, useState } from 'react'
import type { LiveRoomState } from '../hooks/use-live-room'
import { parseChatLine } from '../lib/live-message'

/**
 * **The full-stage gift animation** — the SVGA a gift carries, played once over the stream.
 *
 * Legacy's `mainView/svgaPlayer`, and its behaviour is kept: an animation plays **once**
 * (`loops = 1`), clears itself when it finishes, never takes the pointer, and a new gift *replaces*
 * the one playing rather than queueing behind it — in a busy room a queue would still be playing
 * gifts from a minute ago.
 *
 * The trigger is the chat's `/give_gift` line, as `useGiftBursts`'s is: there is no `give_gift`
 * channel on the wire — legacy re-broadcasts the chat frame on a local emitter under that name, so
 * this listens to what that emitter was fed.
 *
 * `svgaplayerweb` is imported **inside the effect**, not at module scope: it touches `window` on
 * import (legacy wraps the whole component in `next/dynamic({ ssr: false })` for that), and doing
 * it here also means a stream in which nobody sends an animated gift downloads none of it.
 *
 * ## Two deliberate differences
 *
 * - **The creator's switch is obeyed.** `gift_effect` is on the event payload for exactly this
 *   effect, and legacy never reads it, so a creator who turned animations off still got them. The
 *   caller passes it as `enabled`.
 * - **`prefers-reduced-motion` gets none.** A full-screen animation is the case WCAG 2.3.3 is
 *   about; the gift still announces itself in the banner and the transcript.
 *
 * ⚠ The file is fetched with XHR, so its host must be in `connect-src`. `shared/config/csp.ts`
 * admits the static CDN, where the gift artwork lives; an animation served from anywhere else fails
 * **closed** — nothing plays, and the banner still does its job.
 */
export function EventGiftAnimation({ room, enabled }: { room: LiveRoomState; enabled: boolean }) {
    const [src, setSrc] = useState<string | null>(null)
    const mountRef = useRef<HTMLDivElement>(null)
    const { isConnected, subscribe } = room

    useEffect(() => {
        if (!enabled || !isConnected) return
        if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
        return subscribe('msg', payload => {
            const line = parseChatLine(payload)
            if (line?.kind !== 'gift') return
            const animation = line.gift?.animation
            if (animation) setSrc(animation)
        })
    }, [enabled, isConnected, subscribe])

    useEffect(() => {
        const node = mountRef.current
        if (!src || !node) return

        let cancelled = false
        let player: { clear: () => void; stopAnimation: (clear?: boolean) => void } | null = null

        void (async () => {
            try {
                const mod = await import('svgaplayerweb')
                /*
                 * A UMD build: webpack and Turbopack both hand a CommonJS module back as its
                 * namespace, some with the classes on it and some only under `default`.
                 */
                const SVGA = ((mod as unknown as { default?: typeof mod }).default ??
                    mod) as typeof mod
                if (cancelled) return
                const parser = new SVGA.Parser()
                const instance = new SVGA.Player(node)
                player = instance
                parser.load(
                    src,
                    video => {
                        if (cancelled) return
                        instance.loops = 1
                        instance.clearsAfterStop = true
                        instance.setVideoItem(video)
                        instance.onFinished(() => setSrc(null))
                        instance.startAnimation()
                    },
                    // A file that will not load is simply not played — the banner carried the gift.
                    () => setSrc(null),
                )
            } catch {
                setSrc(null)
            }
        })()

        return () => {
            cancelled = true
            try {
                player?.stopAnimation(true)
                player?.clear()
            } catch {
                // Tearing down a player that never finished loading can throw; nothing to recover.
            }
        }
    }, [src])

    if (!src) return null
    return (
        <div
            ref={mountRef}
            aria-hidden
            data-testid="event-gift-animation"
            className="pointer-events-none absolute inset-0 z-20"
        />
    )
}
