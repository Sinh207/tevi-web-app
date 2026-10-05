'use client'

import { cn } from '@shared/lib/utils'
import { useEffect, useRef } from 'react'

/**
 * A Bodymovin/Lottie animation, loaded only where one is actually on screen.
 *
 * ## Everything here is about not paying for it
 *
 * `lottie-web` is 168 KB minified in its *light* build — bigger than several routes in this app —
 * so none of it may reach a page that is not showing an animation:
 *
 * - the player is **dynamically imported inside the effect**, so it is a chunk fetched on mount
 *   rather than something a route's bundle pulls in;
 * - the **`light`** build, which drops the expression evaluator — a small JS interpreter for After
 *   Effects expressions. Nothing we ship uses one; if a future animation does, its layers will not
 *   move, and the fix is to say so here rather than to grow every page that has an animation;
 * - the JSON is **fetched by URL, never imported**. `icon-live-main.json` carries five base64 PNGs,
 *   and importing it would inline 17 KB of artwork into a JS chunk where it can be neither cached
 *   on its own nor served with the compression a `.json` gets.
 *
 * Whether an animation may play at all is the **caller's** decision (`useMayAnimate`) — mounting
 * this component is what downloads the player, so a component that decided internally would have
 * paid for the thing it decided against.
 *
 * ## ⚠ The import path is `esm/`, and changing it back breaks the component silently
 *
 * `lottie-web/build/player/lottie_light` is a UMD file that opens with
 * `(typeof document !== 'undefined') && (typeof navigator !== 'undefined') && (function (…) { … })`
 * — so its `module.exports = factory()` sits **inside an `&&` expression** rather than at statement
 * level. A bundler that looks for top-level CJS assignments finds none, hands the dynamic import a
 * namespace whose `default` is empty, and `lottie.loadAnimation` is `undefined`. The rejection used
 * to be swallowed by a bare `void import(…).then(…)`, so the only symptom was **a blank box**.
 *
 * `build/player/esm/lottie_light.min.js` is real ESM (`export { lottie as default }`) with no
 * guard. The `.catch()` below exists so the next failure of this kind cannot be silent either.
 */
export function LottieAnimation({
    src,
    className,
    ariaLabel,
    frame,
    animate = false,
}: {
    /** URL of the animation JSON — a path under `public/`, never an import. */
    src: string
    className?: string
    /**
     * What the animation *says*, for a reader who cannot see it. Omit for decoration that sits
     * beside text already saying it, which leaves the element `aria-hidden`.
     */
    ariaLabel?: string
    /**
     * Hold a **single frame** instead of looping: the animation becomes a two-state icon.
     *
     * The reaction star is why this exists. One artwork carries an unpressed star, a pressed star
     * and the burst between them, so the resting state of the control is a still from the same file
     * that animates the transition — which is the only way the two states cannot drift apart.
     *
     * With a frame set there is no playback at rest: `autoplay` and `loop` are off and nothing is
     * scheduled on rAF, so a feed holding twenty of these costs twenty SVG trees and no frame loop.
     * It is also why this does not consult `useMayAnimate` — a still frame is not motion, and a
     * reader who asked for less of it should still see which posts they have reacted to.
     */
    frame?: number
    /**
     * Play **to** a changed `frame` instead of jumping to it.
     *
     * This is legacy's `playSegments([from, to], true)`, and the direction falls out of the two
     * frames: reacting plays `0 → 60`, taking it back plays `60 → 0`. The caller flips this on for
     * a press and leaves it off for the first paint, so a feed scrolling into view does not play
     * twenty animations at once.
     */
    animate?: boolean
}) {
    const host = useRef<HTMLDivElement>(null)
    /**
     * The player, held across renders so a `frame` change can drive it instead of rebuilding it.
     * Recreating on every frame is what would make `animate` impossible: there would be no previous
     * frame to play from.
     */
    const playerRef = useRef<LottiePlayer | null>(null)
    /** Applied once the JSON has landed — a frame set before that is silently ignored. */
    const pendingRef = useRef<{ frame: number; animate: boolean } | null>(null)
    const lastFrameRef = useRef<number | null>(null)

    /**
     * Read from the prop, **not** from `pendingRef`.
     *
     * Effects run in declaration order, so the one below runs before the one that fills that ref —
     * which meant the player was built with `autoplay`/`loop` on and a still icon looped forever.
     * A boolean derived during render has no such ordering.
     */
    const isStill = frame !== undefined

    useEffect(() => {
        const node = host.current
        if (!node) return
        let cancelled = false

        import('lottie-web/build/player/esm/lottie_light.min.js')
            .then(({ default: lottie }) => {
                /*
                 * The import can lose its race with unmount. Without this, a page left before the
                 * chunk lands attaches a player to a detached node — one that goes on running rAF
                 * for as long as the tab is open, because nothing holds a reference to stop it.
                 */
                if (cancelled) return
                const player = lottie.loadAnimation({
                    container: node,
                    renderer: 'svg',
                    loop: !isStill,
                    autoplay: !isStill,
                    path: src,
                })
                playerRef.current = player
                /*
                 * `DOMLoaded`, not straight away: before the JSON lands the player does not know how
                 * many frames it has, so `goToAndStop` is ignored and the icon sits at frame 0 —
                 * the pressed state never appears and nothing throws.
                 */
                player.addEventListener('DOMLoaded', () => {
                    const pending = pendingRef.current
                    if (!pending) return
                    player.goToAndStop(pending.frame, true)
                    lastFrameRef.current = pending.frame
                })
            })
            .catch(error => {
                // Never silent again — see the import-path note above.
                console.error('[LottieAnimation] failed to load the player', error)
            })

        return () => {
            cancelled = true
            playerRef.current?.destroy()
            playerRef.current = null
            lastFrameRef.current = null
        }
    }, [src, isStill])

    useEffect(() => {
        if (frame === undefined) {
            pendingRef.current = null
            return
        }
        pendingRef.current = { frame, animate }

        const player = playerRef.current
        if (!player?.isLoaded) return

        const from = lastFrameRef.current
        if (from === frame) return
        if (animate && from !== null) player.playSegments([from, frame], true)
        else player.goToAndStop(frame, true)
        lastFrameRef.current = frame
    }, [frame, animate])

    return (
        <div
            ref={host}
            className={cn('pointer-events-none select-none', className)}
            {...(ariaLabel ? { role: 'img', 'aria-label': ariaLabel } : { 'aria-hidden': true })}
        />
    )
}

/** Only the surface this component drives — `lottie-web` ships no types for the esm build path. */
type LottiePlayer = {
    isLoaded: boolean
    destroy: () => void
    goToAndStop: (value: number, isFrame?: boolean) => void
    playSegments: (segments: [number, number], forceFlag?: boolean) => void
    addEventListener: (name: string, handler: () => void) => void
}
