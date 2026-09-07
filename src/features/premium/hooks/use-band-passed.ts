'use client'

import { APP_BAR_HEIGHT } from '@shared/ui/app-bar'
import { useEffect, useState } from 'react'

/**
 * Has the brand band scrolled out from under the bar? — the one piece of state `/premium`'s chrome
 * needs, and the reason the bar and the band are siblings rather than nested.
 *
 * The bar is transparent with white ink while there is still brand colour behind it, and takes the
 * page's ground and ink once there is not. That question belongs to neither component on its own:
 * the **band**'s last pixel answers it and the **bar** renders the answer, so `PremiumView` owns it
 * and hands each half what it needs.
 *
 * ## Why the sentinel is at the band's bottom, not its top
 *
 * It was at the top first, and the bar then turned into a light plate the moment the reader scrolled
 * a pixel — a grey slab across the middle of the violet, where legacy has the bar blended into the
 * artwork for the whole band. The question is "is there still brand colour behind me", and only the
 * band's *last* pixel answers it.
 *
 * ## The sentinel is held in **state**, not in a ref
 *
 * A ref does not trigger a re-render, so the effect below could only run on mount — which is wrong
 * for any screen whose band is **not** mounted at the same moment this hook is. `/gift-premium` is
 * exactly that: its first step is a picker with no band at all, so `ref.current` was `null` when the
 * effect ran, the observer was never attached, and the bar then stayed transparent over the offer
 * for the rest of the session. Holding the node in state makes it the dependency: honest, and the
 * effect re-runs at exactly the moment the band appears or goes away.
 *
 * The setter React hands back is referentially stable, so it is usable directly as the callback ref
 * with nothing to memoise. Same technique, and the same reasoning, as `AnimatedAvatar`'s `videoEl`.
 *
 * ## `boundingClientRect.top`, not `isIntersecting`
 *
 * The sentinel is outside the (shrunk) root both **before** it arrives — below the fold — and
 * **after** it leaves, above the bar, and those are opposite answers to this question. The rect is
 * viewport-relative and is reported on every crossing, so one comparison against the bar's own
 * height covers both directions. A `scrollY > n` listener would instead have to know which element
 * scrolls (the document today, whatever a future layout introduces tomorrow) and would fire on every
 * frame of a scroll rather than twice.
 */
export function useBandPassed(): {
    /** Callback ref — put it on the band's last pixel. See the note above on why it is not a ref. */
    ref: (node: HTMLDivElement | null) => void
    passed: boolean
} {
    const [node, setNode] = useState<HTMLDivElement | null>(null)
    /**
     * `false` on the server and on the first client render, which is the honest answer: the page
     * loads at the top of the band, so the bar starts transparent and nothing flashes.
     */
    const [passed, setPassed] = useState(false)

    useEffect(() => {
        if (!node || typeof IntersectionObserver === 'undefined') {
            /*
             * No band on screen — a step that has none, or one that has just gone. `false` is the
             * honest answer ("there is no brand colour behind the bar to have scrolled past"), and
             * resetting it is what stops a stale `true` from a previous step painting the plate over
             * the next band's first frame.
             */
            setPassed(false)
            return
        }
        const observer = new IntersectionObserver(
            entries => {
                const entry = entries[0]
                if (entry) setPassed(entry.boundingClientRect.top < APP_BAR_HEIGHT)
            },
            // The bar is 60 tall and sticks at the top, so the root's top edge is 60px down.
            { rootMargin: `-${APP_BAR_HEIGHT}px 0px 0px 0px`, threshold: 0 },
        )
        observer.observe(node)
        return () => observer.disconnect()
    }, [node])

    return { ref: setNode, passed }
}
