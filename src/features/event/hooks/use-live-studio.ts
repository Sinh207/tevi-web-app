'use client'

import { useEffect, useState } from 'react'
import type { EventDetail } from '../api/types'
import { isOffAir, RECENTLY_ENDED_MS } from '../lib/event-status'
import { COMPACT_STUDIO_ENABLED, isStudioEligible, STUDIO_MIN_WIDTH } from '../lib/studio'

/**
 * **Should this reader be in the Live studio rather than on the Live details page?**
 *
 * Legacy's `EventLayout` condition, as a hook — the two halves it cannot put in a pure function
 * (`matchUpMd` and the passage of time) live here, and `isStudioEligible` holds the rest.
 *
 * ## `false` on the first render, always
 *
 * The server cannot read `matchMedia` and must not guess: a desktop render that claimed the studio
 * would emit a `fixed inset-0` stage into the HTML, and a phone loading that page would be covered
 * by it until hydration corrected the guess. So the first client render matches the server's
 * (`false`, the details page) and the studio arrives in an effect.
 *
 * That costs nothing visible. The studio's whole content is a video stream and a socket room,
 * neither of which could have been in the first paint anyway — the same argument `useRailVisible`
 * makes, and this hook is deliberately shaped like it.
 *
 * ## The five-minute window has to actually expire
 *
 * The other half is subtler and is why this is not one `matchMedia` call. A stream that ends while
 * somebody is watching keeps them in the studio for five minutes (see `RECENTLY_ENDED_MS`), and
 * then they belong back on the details page. Nothing re-renders on its own at that moment: the
 * event payload stopped changing when the status flipped to `ENDED`, so a hook that only read the
 * clock during render would hold the reader on "the broadcast has ended" until they touched
 * something. One timer, armed for exactly the remaining window, ends it.
 *
 * The timer is armed **only** while the answer can still change — an off-air stream inside its
 * window. A live stream has no expiry to wait for, and a long-ended one has nothing left to expire.
 */
export function useLiveStudio(event: EventDetail | null): boolean {
    /*
     * Mounted, not "wide enough". The studio used to open only from 900px (legacy's `matchUpMd`,
     * and Figma's *"Live isn't available on mobile web"*); it now opens on every width — a narrow
     * screen gets its own portrait layout (`useCompactStudio`) — so width no longer decides
     * *whether*. The first render still says `false`, for the hydration reason above.
     */
    const [mounted, setMounted] = useState(false)
    /*
     * And wide enough — while the phone studio is switched off (`COMPACT_STUDIO_ENABLED`), a
     * narrow screen is not a studio at all, as on legacy, and follows the window as it resizes.
     */
    const [wideEnough, setWideEnough] = useState(false)
    useEffect(() => {
        const mq = window.matchMedia(`(min-width: ${STUDIO_MIN_WIDTH}px)`)
        const update = () => setWideEnough(mq.matches)
        update()
        mq.addEventListener('change', update)
        return () => mq.removeEventListener('change', update)
    }, [])
    /*
     * Bumped by the timer below, and read as the `now` every eligibility check uses. State rather
     * than a `Date.now()` in the render body so the value is stable across a pass — two components
     * reading the clock a millisecond apart can land on opposite sides of the window.
     */
    const [now, setNow] = useState(() => Date.now())

    useEffect(() => setMounted(true), [])

    const endedAt = event?.ended_at ?? null
    const offAir = isOffAir(event?.status ?? null)

    useEffect(() => {
        if (!offAir || !endedAt) return

        const at = new Date(endedAt).getTime()
        if (Number.isNaN(at)) return

        /*
         * What is left of the window, from *now* rather than from mount — a reader who arrives four
         * minutes after the stream stopped gets a one-minute timer, not a five-minute one.
         *
         * A non-positive remainder means the window has already closed, and there is nothing to
         * arm: `isStudioEligible` is already answering `false` and a zero-delay timeout would only
         * schedule a render that changes nothing.
         */
        const remaining = at + RECENTLY_ENDED_MS - Date.now()
        if (remaining <= 0) return

        /*
         * ⚠ **`+ 1`, and without it the window never closes.**
         *
         * `isRecentlyEnded`'s boundary is inclusive — `now - at <= RECENTLY_ENDED_MS` — so a timer
         * armed for exactly `remaining` fires at the one millisecond where the predicate is still
         * `true`. It re-renders, gets the same answer, and there is no second timer to arm because
         * the effect's dependencies have not changed. The reader stays on "the broadcast has
         * ended" until they navigate.
         *
         * Nothing fails and nothing logs: the screen is a legitimate one that is simply five
         * minutes stale. It was caught by the test below advancing the clock and reading the
         * answer, which is the only way to see it.
         */
        const timer = window.setTimeout(() => setNow(Date.now()), remaining + 1)
        return () => window.clearTimeout(timer)
    }, [offAir, endedAt])

    return mounted && (COMPACT_STUDIO_ENABLED || wideEnough) && isStudioEligible(event, now)
}

/**
 * **The portrait studio** — `true` below `STUDIO_MIN_WIDTH`, where there is no room for a chat
 * column beside the stage and the studio lays itself out as a full-screen vertical player with the
 * chat over it. `false` on the first render (the server cannot read `matchMedia`), and it follows
 * the window as it is resized.
 */
export function useCompactStudio(): boolean {
    const [compact, setCompact] = useState(false)
    useEffect(() => {
        const mq = window.matchMedia(`(max-width: ${STUDIO_MIN_WIDTH - 0.02}px)`)
        const update = () => setCompact(mq.matches)
        update()
        mq.addEventListener('change', update)
        return () => mq.removeEventListener('change', update)
    }, [])
    return compact
}
