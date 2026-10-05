'use client'

import { usePathname } from 'next/navigation'
import { useEffect } from 'react'

/**
 * **Where the reader was before this route, inside the app** — the referrer a client-side
 * navigation never sets.
 *
 * `document.referrer` belongs to the **document**: it is written once, by the load that created the
 * page, and every `next/link` or `router.push` after that leaves it untouched. So a reader who
 * opened the app directly and then went Following → a live → back to the space still has an empty
 * referrer on the space page, and anything reading it as "where did they come from" answers
 * "outside" — which is how `ChannelLiveRedirect` sent that reader straight back into the live they
 * had just left, every time, with no way out but closing the tab.
 *
 * Module state, one copy per document, which is exactly the lifetime the question has: a full load
 * starts it empty, and then `document.referrer` is right again. Fed by `useTrackInAppRoute`,
 * mounted once by `session-providers.tsx`.
 *
 * ## Why two slots, and why the answer is order-independent
 *
 * The tracker records in an effect, and effects run children first — so when a page's own effect
 * asks, the tracker may or may not have recorded that page yet. Keeping the current *and* the
 * previous path makes either order give the same answer: if `current` is already the asking page,
 * the answer is `previous`; otherwise `current` is still the page they came from.
 */
let current: string | null = null
let previous: string | null = null

/** The in-app path the reader arrived from, or `null` when this route is the document's first. */
export function inAppReferrer(pathname: string): string | null {
    return current === pathname ? previous : current
}

/** Records every route this document shows. Mount once, at the session root. */
export function useTrackInAppRoute(): void {
    const pathname = usePathname()
    useEffect(() => {
        if (pathname === current) return
        previous = current
        current = pathname
    }, [pathname])
}

/** Test seam — module state survives between cases otherwise. */
export function resetInAppReferrer(): void {
    current = null
    previous = null
}
