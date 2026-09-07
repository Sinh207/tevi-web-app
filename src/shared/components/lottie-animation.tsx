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
 */
export function LottieAnimation({
    src,
    className,
    ariaLabel,
}: {
    /** URL of the animation JSON — a path under `public/`, never an import. */
    src: string
    className?: string
    /**
     * What the animation *says*, for a reader who cannot see it. Omit for decoration that sits
     * beside text already saying it, which leaves the element `aria-hidden`.
     */
    ariaLabel?: string
}) {
    const host = useRef<HTMLDivElement>(null)

    useEffect(() => {
        const node = host.current
        if (!node) return
        let animation: { destroy: () => void } | null = null
        let cancelled = false

        void import('lottie-web/build/player/lottie_light').then(({ default: lottie }) => {
            /*
             * The import can lose its race with unmount. Without this, a page left before the chunk
             * lands attaches a player to a detached node — one that goes on running rAF for as long
             * as the tab is open, because nothing holds a reference to stop it.
             */
            if (cancelled) return
            animation = lottie.loadAnimation({
                container: node,
                renderer: 'svg',
                loop: true,
                autoplay: true,
                path: src,
            })
        })

        return () => {
            cancelled = true
            animation?.destroy()
        }
    }, [src])

    return (
        <div
            ref={host}
            className={cn('pointer-events-none select-none', className)}
            {...(ariaLabel ? { role: 'img', 'aria-label': ariaLabel } : { 'aria-hidden': true })}
        />
    )
}
