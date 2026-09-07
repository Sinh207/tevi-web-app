'use client'

import { useEffect, useRef } from 'react'

/**
 * Bring an element back under the sticky chrome when the thing it shows is replaced.
 *
 * The case it exists for: a reader is halfway down a long ledger, changes the filter, and the new
 * list has three rows in it. Without this they are left looking at the empty space where row forty
 * used to be, with the rows they asked for above the fold — which reads as "the filter returned
 * nothing".
 *
 * ## Only when the element's top is already above the fold
 *
 * A reader who changes a filter while the list's header is still on screen has not lost their place,
 * so moving the page under them would be the surprise rather than the fix. The guard is the element's
 * own position: scroll only if its top has passed `offset`.
 *
 * ## `auto`, not `smooth`
 *
 * A smooth scroll over several thousand pixels takes long enough that the new rows paint *during* the
 * travel, so the reader watches unrelated content fly past. This is a correction, not a transition —
 * and `prefers-reduced-motion` would have to be honoured for the smooth version anyway, which is two
 * behaviours to keep in step for no gain.
 *
 * The first render is skipped: mounting is not a change, and scrolling on mount would fight the
 * browser's own scroll restoration on a back navigation.
 */
export function useScrollIntoViewOnChange(
    ref: { current: HTMLElement | null },
    /** Re-run when this changes. */
    key: unknown,
    /** Height of whatever is sticky above the element, in px. */
    offset = 0,
) {
    const previous = useRef(key)

    useEffect(() => {
        if (previous.current === key) return
        previous.current = key

        const element = ref.current
        if (!element) return

        const top = element.getBoundingClientRect().top
        // Already in view below the sticky chrome — the reader has not lost their place.
        if (top >= offset) return

        window.scrollTo({ top: window.scrollY + top - offset, behavior: 'auto' })
    }, [key, offset, ref])
}
