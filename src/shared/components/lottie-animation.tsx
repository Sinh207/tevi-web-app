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
 *   on its own nor served with the compression a `.json` gets;
 * - and it is fetched **once per URL**, not once per player (`loadAnimationData`). Handing lottie a
 *   `path` made every instance request and parse the file itself — the reaction star is 117 KB and
 *   sits on every post and every reply, and the render windows remount rows as they scroll, so a
 *   ten-second scroll of the home feed issued 129 requests for that one file (each a revalidation:
 *   `public/` is served `max-age=0`). Measured on a production build.
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
    once,
    hideLayers,
    onComplete,
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
    /**
     * Play this segment **once**, on load, and stop — a one-shot effect laid over something else
     * (the reaction burst over the sprite's star). Mount a fresh instance (a new `key`) per play.
     * Ignored when `frame` is set.
     */
    once?: readonly [number, number]
    /**
     * Layers to leave out, by their name in the file (`nm`). For an animation whose artwork carries
     * colours that cannot follow the theme: the reaction star's own two star layers are baked dark
     * and white, so the post card draws the star from the DS sprite and keeps only the burst.
     */
    hideLayers?: readonly string[]
    /** A `once` segment finished. */
    onComplete?: () => void
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
    const playsOnce = !isStill && once !== undefined
    // Read through refs inside the build: identity-unstable props must not rebuild the player.
    const onceRef = useRef(once)
    onceRef.current = once
    const hiddenRef = useRef(hideLayers)
    hiddenRef.current = hideLayers
    const completeRef = useRef(onComplete)
    completeRef.current = onComplete

    useEffect(() => {
        const node = host.current
        if (!node) return
        let cancelled = false

        Promise.all([
            import('lottie-web/build/player/esm/lottie_light.min.js'),
            loadAnimationData(src),
        ])
            .then(([{ default: lottie }, data]) =>
                scheduleBuild(() => {
                    /*
                     * The import can lose its race with unmount — and so can the queue below. Without
                     * this, a page left before the build attaches a player to a detached node — one that
                     * goes on running rAF for as long as the tab is open, because nothing holds a
                     * reference to stop it.
                     */
                    if (cancelled) return
                    // A copy per player: lottie-web completes the data it is given in place.
                    const copy = structuredClone(data) as { layers?: { nm?: string }[] }
                    const hidden = hiddenRef.current
                    if (hidden?.length && Array.isArray(copy.layers)) {
                        copy.layers = copy.layers.filter(layer => !hidden.includes(layer.nm ?? ''))
                    }
                    const player = lottie.loadAnimation({
                        container: node,
                        renderer: 'svg',
                        loop: !isStill && !playsOnce,
                        autoplay: !isStill && !playsOnce,
                        animationData: copy,
                    })
                    playerRef.current = player
                    if (playsOnce) {
                        const segment = onceRef.current
                        const play = () => {
                            if (segment) player.playSegments([segment[0], segment[1]], true)
                        }
                        player.addEventListener('complete', () => completeRef.current?.())
                        if (player.isLoaded) play()
                        else player.addEventListener('DOMLoaded', play)
                        return
                    }
                    /*
                     * Not straight away unless it is already loaded: before the DOM is built the player
                     * does not know how many frames it has, so `goToAndStop` is ignored and the icon
                     * sits at frame 0 — the pressed state never appears and nothing throws. With the
                     * data handed over in memory `DOMLoaded` can fire inside `loadAnimation`, before a
                     * listener exists, which is what the `isLoaded` check covers.
                     */
                    const applyPending = () => {
                        const pending = pendingRef.current
                        if (!pending) return
                        player.goToAndStop(pending.frame, true)
                        lastFrameRef.current = pending.frame
                    }
                    if (player.isLoaded) applyPending()
                    else player.addEventListener('DOMLoaded', applyPending)
                }),
            )
            .catch(error => {
                // Never silent again — see the import-path note above.
                console.error('[LottieAnimation] failed to load the player or its animation', error)
            })

        return () => {
            cancelled = true
            playerRef.current?.destroy()
            playerRef.current = null
            lastFrameRef.current = null
        }
    }, [src, isStill, playsOnce])

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

/**
 * Each animation's JSON, by URL, for the life of the page — the fetch and the parse are paid once
 * however many players draw it. A failure is forgotten, so the next mount can try again.
 */
const animationData = new Map<string, Promise<unknown>>()

function loadAnimationData(src: string): Promise<unknown> {
    const cached = animationData.get(src)
    if (cached) return cached
    const pending = fetch(src).then(response => {
        if (!response.ok) throw new Error(`${src} answered ${response.status}`)
        return response.json() as Promise<unknown>
    })
    animationData.set(src, pending)
    pending.catch(() => animationData.delete(src))
    return pending
}

/**
 * Building a player is synchronous DOM work — the reaction star is thirteen layers and an image —
 * and a page of posts or replies mounts twenty of them in one commit. While each player fetched its
 * own JSON the builds landed whenever each response did, spread out by accident; with the data
 * shared they would all land in the same task (measured: ~90ms at 4× CPU, once per page appended).
 * So builds queue, and the queue runs in slices that leave the main thread every `BUILD_SLICE_MS`
 * — a scroll in progress gets its frames between them.
 */
const BUILD_SLICE_MS = 8
const builds: Array<() => void> = []
let draining = false

function scheduleBuild(build: () => void) {
    builds.push(build)
    if (draining) return
    draining = true
    setTimeout(drainBuilds, 0)
}

function drainBuilds() {
    const start = performance.now()
    while (builds.length > 0 && performance.now() - start < BUILD_SLICE_MS) {
        const build = builds.shift()
        try {
            build?.()
        } catch (error) {
            // One broken animation must not strand every player queued behind it.
            console.error('[LottieAnimation] failed to build a player', error)
        }
    }
    if (builds.length > 0) setTimeout(drainBuilds, 0)
    else draining = false
}
