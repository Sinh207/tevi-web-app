'use client'

import { useEffect, useRef, useState } from 'react'

/**
 * Whether a top bar should be **tucked away** right now — `true` while the reader is scrolling down
 * the page, `false` the moment they scroll back up. The mobile shell's `AppTopBar` is the caller:
 * on a phone it costs 60px of a ~700px viewport on every tab screen, and it is wanted only when the
 * reader is heading back towards the top.
 *
 * ## The rules, each against a specific failure
 *
 * - **Never hidden within `revealWithin` of the top.** Hiding at `scrollY = 3` blanks the bar for
 *   a nudge, and the page then looks like it has no header at all.
 * - **A dead zone of `threshold` px** before the direction counts. A finger resting on glass
 *   produces a stream of ±1px deltas; without it the bar flickers.
 * - **Overscroll is ignored.** iOS rubber-banding reports `scrollY < 0` at the top and
 *   `scrollY > max` at the bottom, and the bounce back from the bottom is an *upward* scroll — the
 *   bar would pop in every time a reader hits the end of the feed.
 * - **`enabled: false` is always "shown"** and detaches the listener: from `md` this bar is
 *   `md:hidden` and the desktop scroll should not be changing anything.
 *
 * Reads `window.scrollY` because this app scrolls the **document** (`following-view.tsx`'s header
 * says why that matters). The listener is passive and the state only changes on a flip, so a
 * scroll costs one comparison per event and a render only twice per gesture at most.
 */
export function useHideOnScroll({
    enabled = true,
    threshold = 8,
    revealWithin = 60,
}: {
    enabled?: boolean
    /** Pixels of travel in one direction before it counts. */
    threshold?: number
    /** Always shown while the page is scrolled less than this. */
    revealWithin?: number
} = {}): boolean {
    const [hidden, setHidden] = useState(false)
    // The scroll position the current direction started from — the dead zone is measured from here.
    const anchor = useRef(0)

    useEffect(() => {
        if (!enabled) {
            setHidden(false)
            return
        }
        anchor.current = window.scrollY

        const onScroll = () => {
            const y = window.scrollY
            const max = document.documentElement.scrollHeight - window.innerHeight
            if (y < 0 || y > max) return

            if (y <= revealWithin) {
                setHidden(false)
                anchor.current = y
                return
            }

            const delta = y - anchor.current
            if (delta > threshold) {
                setHidden(true)
                anchor.current = y
            } else if (delta < -threshold) {
                setHidden(false)
                anchor.current = y
            }
        }

        window.addEventListener('scroll', onScroll, { passive: true })
        return () => window.removeEventListener('scroll', onScroll)
    }, [enabled, threshold, revealWithin])

    return enabled && hidden
}
