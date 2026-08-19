'use client'

import { type RefCallback, useCallback, useEffect, useRef, useState } from 'react'

/**
 * Whether an element is on screen, via one `IntersectionObserver` per element.
 *
 * Two callers with quite different needs, which is why this is shared rather than living
 * next to either of them:
 *
 * - **Infinite lists** want to know that the sentinel below the last row is *approaching*,
 *   so the next page is already in flight by the time the reader gets there. Hence the
 *   generous default `rootMargin` — a loader that only fires when the sentinel is actually
 *   visible always shows a spinner.
 * - **Animated avatars** want to know that they are on screen so they can play, and off
 *   screen so they can stop. A feed of twenty comments is twenty `<video>` elements; left
 *   autoplaying, that is what makes scrolling stutter and batteries drain. Legacy autoplays
 *   all of them unconditionally.
 *
 * Deliberately not a package: `react-intersection-observer` (which legacy uses) is a
 * dependency for thirty lines, and its `<InView>` render-prop shape does not fit either
 * caller as well as a ref does.
 */
export interface UseInViewOptions {
    /**
     * How far outside the viewport still counts as "in view". The list default of 600px is
     * roughly a screen of lead time; pass `'0px'` when you want strict visibility, as a
     * video does — playing a clip a screen early is waste, not prefetch.
     */
    rootMargin?: string
    threshold?: number | number[]
    /**
     * Stop observing once it has been seen. For a list sentinel that has run out of pages,
     * or anything that only needs to fire once (lazy mount, impression tracking).
     */
    once?: boolean
    /**
     * `false` detaches the observer and reports `false`. Use it to stop watching a sentinel
     * when `hasNextPage` goes false, rather than leaving an observer attached to an element
     * whose callback will do nothing.
     */
    enabled?: boolean
}

/**
 * Returns a ref callback to put on the element, and whether it is in view.
 *
 * A ref **callback** rather than a `RefObject` because the observed node is often
 * conditionally rendered (a sentinel that only exists while there are more pages). With a
 * ref object, mounting the node later does not re-run the effect that observes it, and the
 * hook silently never fires — the failure mode being an infinite list that loads one page.
 */
export function useInView<T extends Element = HTMLDivElement>({
    rootMargin = '600px',
    threshold = 0,
    once = false,
    enabled = true,
}: UseInViewOptions = {}): [RefCallback<T>, boolean] {
    const [inView, setInView] = useState(false)
    const [node, setNode] = useState<T | null>(null)
    /** Latched so `once` cannot be un-seen by a later scroll, or by a re-render. */
    const seen = useRef(false)

    const ref = useCallback<RefCallback<T>>(next => setNode(next), [])

    useEffect(() => {
        if (!enabled || !node) {
            setInView(false)
            return
        }
        if (once && seen.current) {
            setInView(true)
            return
        }
        // Server-rendered and older browsers: report "in view" rather than "never", so a
        // list still loads and a video still plays. Failing closed here would look like
        // broken pagination on the exact clients least able to explain themselves.
        if (typeof IntersectionObserver === 'undefined') {
            setInView(true)
            return
        }

        const observer = new IntersectionObserver(
            entries => {
                const isIntersecting = entries.some(entry => entry.isIntersecting)
                if (isIntersecting) seen.current = true
                setInView(isIntersecting)
                if (isIntersecting && once) observer.disconnect()
            },
            { rootMargin, threshold },
        )
        observer.observe(node)
        return () => observer.disconnect()
    }, [enabled, node, once, rootMargin, threshold])

    return [ref, inView]
}
