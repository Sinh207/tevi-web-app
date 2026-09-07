'use client'

import { useEffect, useState } from 'react'

/**
 * "Has this mounted long enough to animate into place?"
 *
 * The player's two floating surfaces — the window and the minimised pill — both appear in response
 * to a press and both should arrive rather than blink into existence. The DS animates its dialogs
 * with `transition-[opacity,scale]` driven by base-ui's `data-starting-style`; neither of these is
 * a base-ui popup, so they need their own first-paint marker, and this is it.
 *
 * ## Why not a keyframe in `globals.css`
 *
 * Because Turbopack serves that file stale until `.next` is cleared, so a new `@keyframes` reads as
 * "the animation does not work" for however long it takes somebody to figure that out. A state flag
 * plus the transition utilities that already exist has no such failure mode.
 *
 * ## Why `requestAnimationFrame` and not just an effect
 *
 * The flipped class has to land in a **later** frame than the mounted one. Setting state directly in
 * an effect can be coalesced into the same style recalculation as the initial render, in which case
 * the browser sees one computed value, not two, and there is no transition at all.
 *
 * Under `prefers-reduced-motion` the flag starts `true` and callers drop the transition classes, so
 * the surface simply appears — which is what that setting asks for.
 */
export function useEnterTransition(): { entered: boolean; reducedMotion: boolean } {
    /*
     * Read once at mount rather than subscribed to. Someone changing the OS setting while a mini app
     * is open does not need this frame's entrance replayed, and a listener here would be a
     * subscription per floating surface for an event nobody acts on.
     */
    const [reducedMotion] = useState(
        () =>
            typeof window !== 'undefined' &&
            window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true,
    )
    const [entered, setEntered] = useState(reducedMotion)

    useEffect(() => {
        if (reducedMotion) return
        const frame = requestAnimationFrame(() => setEntered(true))
        return () => cancelAnimationFrame(frame)
    }, [reducedMotion])

    return { entered, reducedMotion }
}
