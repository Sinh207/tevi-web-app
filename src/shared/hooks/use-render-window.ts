'use client'

import { type RefCallback, useCallback, useEffect, useMemo, useRef, useState } from 'react'

/**
 * Keep a long list's DOM bounded: render the rows around the reader and stand the rest down to a
 * box of the height they had.
 *
 * ## Why a list this shape needs it at all
 *
 * A feed row is not cheap. A `PostCard` carries an avatar, a media block, a Lottie instance for the
 * reaction button (~33KB of inlined base64 in the DOM, measured) and its own menu — and an infinite
 * list keeps every row it has ever fetched. Ten pages of twenty is two hundred of them, none of
 * which the reader can see.
 *
 * Both native clients solve this with the platform's list recycling: iOS destroys a `UITableView`
 * cell on scroll-off (`prepareForReuse` cancels the image load, releases the backing `UIImage` and
 * stops the video) and Android's `RecyclerView` does the same. Neither trims the **data** — the
 * posts stay in memory, it is the *views* that go. This hook is that idea, and nothing more: it
 * says which keys to render, and the list keeps its own data.
 *
 * ## What survives the teardown is a height, and that is the whole difficulty
 *
 * iOS keeps `cellHeightCachingMap[post.id]` and warns, in as many words, that returning
 * `automaticDimension` from `estimatedHeightForRowAt` produces "massive scroll jumps and relayout
 * storms". Same rule here: a row that collapses to nothing while above the viewport drags the
 * content under it upward, and the reader's scroll position lands somewhere else. So a row is
 * only ever stood down **after** it has been measured, and it is stood down to exactly that height.
 *
 * `heightFor` returning `null` therefore means "render it" — see `shouldRender`.
 *
 * ## Four things legacy's `useInView` does that this does not
 *
 * Legacy web already has this (`src/hooks/useInView.js`, used by five post lists). It works, and
 * four of its details are deliberately not carried over:
 *
 * 1. **It keys heights and the window by array index.** Its own feed prepends new posts and removes
 *    blocked ones, and every index then points at a different row, so a measured height ends up on
 *    the wrong one. Keys here are **caller-supplied strings**, so a row keeps its height through a
 *    removal, a prepend and a reorder. (iOS keys by `post.id` for the same reason.)
 * 2. **Its window size is `isMobile ? 10 : 20`, read from `react-device-detect` at module scope.**
 *    That decides the *initial* render window, so a server render and a phone disagree about how
 *    many rows exist — a hydration mismatch of the same family `calendar-lazy.tsx` documents. One
 *    number here, for every client: the window grows from what is genuinely on screen anyway, so on
 *    a tall viewport it exceeds the floor within one frame and the constant stops mattering.
 * 3. **It writes `entry.target.style.minHeight` directly, beside a React `heights` state holding the
 *    same number.** Two owners for one value. Here the height is state and the box is rendered from
 *    it.
 * 4. **Its placeholder is an animating `<Skeleton>`.** Every stood-down row then runs a shimmer
 *    keyframe, off screen, forever — paint work in the component whose purpose is to avoid paint
 *    work. The caller here is handed a height and should draw nothing.
 */
export interface UseRenderWindowOptions {
    /**
     * The fewest rows to render when nothing has been measured yet — the first paint, and the
     * server's. The window is grown past this by whatever is actually on screen, so this is a floor
     * rather than a cap.
     */
    minimum?: number
    /**
     * Rows kept mounted on each side of the visible run. This is the budget for a fast flick: a row
     * scrolled into view that was not mounted paints empty for a frame, and overscan is how many
     * frames of that the reader is spared.
     */
    overscan?: number
    /**
     * How long to wait after the last visibility change before recomputing. An
     * `IntersectionObserver` fires in bursts during a scroll, and recomputing on each one would
     * remount rows mid-flick.
     */
    settleMs?: number
}

export interface RenderWindow {
    /** Put this on the **wrapper** that stays mounted for every row, visible or not. */
    observe: RefCallback<HTMLElement>
    /** Whether the caller should render this row's real content. */
    shouldRender: (key: string) => boolean
    /** The height to hold open for a row that is stood down, or `null` if it must be rendered. */
    heightFor: (key: string) => number | null
}

/** The key a wrapper publishes so one observer can serve the whole list. */
const KEY_ATTRIBUTE = 'data-window-key'

export function useRenderWindow(
    keys: readonly string[],
    { minimum = 10, overscan = 4, settleMs = 80 }: UseRenderWindowOptions = {},
): RenderWindow {
    /**
     * Measured heights, by key. In a ref rather than state on purpose: a height is read only while
     * deciding what a **stood-down** row should look like, and that decision is already triggered
     * by the window changing. Putting it in state would re-render the list on every row measured,
     * which during a scroll is every frame.
     */
    const heights = useRef(new Map<string, number>())
    const visible = useRef(new Set<string>())
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

    /**
     * The **span** of rendered rows, as a pair of indices rather than a set of keys.
     *
     * A pair is what makes the common case cheap: scrolling one row moves two integers, and a
     * `Set` of forty keys would be rebuilt and compared instead. It is also the honest shape — the
     * window is always contiguous, because rows between two visible rows are visible.
     */
    const [span, setSpan] = useState<readonly [number, number]>([0, minimum])

    /** Key → position, so a visibility change can be turned into an index without a scan. */
    const indexOf = useMemo(() => {
        const map = new Map<string, number>()
        for (const [index, key] of keys.entries()) map.set(key, index)
        return map
    }, [keys])

    /*
     * `indexOf` is what the settle callback reads, and it is rebuilt whenever the list changes.
     * Reaching it through a ref keeps `observe` stable, so a list that appends a page does not
     * detach and re-attach an observer on every surviving row.
     */
    const indexOfRef = useRef(indexOf)
    indexOfRef.current = indexOf
    const lengthRef = useRef(keys.length)
    lengthRef.current = keys.length
    const settingsRef = useRef({ minimum, overscan })
    settingsRef.current = { minimum, overscan }

    const settle = useCallback(() => {
        const { minimum: floor, overscan: pad } = settingsRef.current
        const positions: number[] = []
        for (const key of visible.current) {
            const index = indexOfRef.current.get(key)
            if (index !== undefined) positions.push(index)
        }

        /*
         * Nothing on screen is not the same as "scrolled past everything" — it is also what a tab
         * hidden behind `display: none` reports, and what the first frame reports before the
         * observer has run. Falling back to the top of the list rather than to an empty window is
         * what stops a hidden list from standing every row down and then jumping when it returns.
         * Legacy needs a `closest('[hidden]')` check for this; the fallback covers it without one.
         */
        const first = positions.length > 0 ? Math.min(...positions) : 0
        const last = positions.length > 0 ? Math.max(...positions) : 0

        const start = Math.max(0, first - pad)
        const end = Math.max(start + floor, last + pad + 1)

        setSpan(current => (current[0] === start && current[1] === end ? current : [start, end]))
    }, [])

    const schedule = useCallback(() => {
        if (timer.current) clearTimeout(timer.current)
        timer.current = setTimeout(settle, settleMs)
    }, [settle, settleMs])

    const observer = useRef<IntersectionObserver | null>(null)

    const getObserver = useCallback(() => {
        if (observer.current) return observer.current
        if (typeof IntersectionObserver === 'undefined') return null

        observer.current = new IntersectionObserver(entries => {
            for (const entry of entries) {
                const key = (entry.target as HTMLElement).getAttribute(KEY_ATTRIBUTE)
                if (!key) continue

                /*
                 * Measured on the way **out**, from the box the reader just scrolled past, which is
                 * the only moment its real height is known and still correct. Zero is not a
                 * measurement — it is what a row inside a hidden tab reports — and recording it
                 * would stand that row down to nothing.
                 */
                const height = entry.boundingClientRect.height
                if (height > 0) heights.current.set(key, height)

                if (entry.isIntersecting) visible.current.add(key)
                else visible.current.delete(key)
            }
            schedule()
        }, OBSERVER_OPTIONS)
        return observer.current
    }, [schedule])

    const observe = useCallback<RefCallback<HTMLElement>>(
        element => {
            if (!element) return
            const instance = getObserver()
            if (!instance) return
            instance.observe(element)
            // React 19 ref cleanup. Without it the observer holds every element the list has ever
            // rendered, which on an infinite feed is the leak this hook exists to prevent.
            return () => instance.unobserve(element)
        },
        [getObserver],
    )

    useEffect(() => {
        return () => {
            if (timer.current) clearTimeout(timer.current)
            observer.current?.disconnect()
            observer.current = null
        }
    }, [])

    /*
     * A row that has left the list takes its height with it. Without this the map is the one thing
     * here that grows without bound — the DOM is capped, the heights would not be.
     */
    useEffect(() => {
        if (heights.current.size <= keys.length) return
        const live = new Set(keys)
        for (const key of heights.current.keys()) {
            if (!live.has(key)) heights.current.delete(key)
        }
    }, [keys])

    const shouldRender = useCallback(
        (key: string) => {
            const index = indexOf.get(key)
            if (index === undefined) return true
            if (index >= span[0] && index < span[1]) return true
            // Never measured, so there is no height to hold its place — see the header. Rendering
            // it is the only option that does not move everything below it.
            return !heights.current.has(key)
        },
        [indexOf, span],
    )

    const heightFor = useCallback(
        (key: string) => (shouldRender(key) ? null : (heights.current.get(key) ?? null)),
        [shouldRender],
    )

    return { observe, shouldRender, heightFor }
}

/**
 * `threshold: 0` — any pixel on screen counts.
 *
 * Legacy uses `0.1`, which on a 700px card means 70px must be showing before it is "in view". That
 * is a tenth of a card of dead zone at each edge of the window, and it buys nothing: the question
 * here is "should this stay mounted", not "has the reader seen it".
 */
const OBSERVER_OPTIONS: IntersectionObserverInit = { threshold: 0 }

/**
 * A selector for one row's wrapper — for a caller that has to reach a row that may be stood down
 * (a chat's "go to the quoted message"), which only the wrapper is guaranteed to be.
 */
export function windowKeySelector(key: string): string {
    return `[${KEY_ATTRIBUTE}="${CSS.escape(key)}"]`
}

/** The attribute `observe` reads the key from. Exported so the row can publish it. */
export function windowKeyProps(key: string): { [KEY_ATTRIBUTE]: string } {
    return { [KEY_ATTRIBUTE]: key }
}
