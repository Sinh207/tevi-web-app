'use client'

import { usePathname } from 'next/navigation'
import { type MouseEvent, useEffect, useState } from 'react'

/** If a navigation never lands, the press stops overriding the route after this long. */
const FALLBACK_MS = 4000

/**
 * Which destination a navigation bar should **draw** as current — the one just pressed, until the
 * route catches up. Shared by the mobile tab bar and the desktop rail so the two answer a press the
 * same way.
 *
 * `usePathname` changes only once the next route has rendered, so a bar that waits for it moves a
 * beat after the finger lifts. The pressed index is held here and returned at once, then handed back
 * to the route when the pathname changes (or after `FALLBACK_MS`, if the navigation never does).
 * A press that opens a new tab or window (a modifier, a middle button) is not this tab moving and is
 * ignored. **`aria-current` must stay on `routeIndex`** — the press is a promise, the page is the
 * fact — which is why both are returned.
 */
export function usePressedDestination(routeIndex: number) {
    const pathname = usePathname()
    const [pressed, setPressed] = useState<number | null>(null)

    // biome-ignore lint/correctness/useExhaustiveDependencies: a new pathname is the signal.
    useEffect(() => setPressed(null), [pathname])
    useEffect(() => {
        if (pressed === null) return
        const fallback = window.setTimeout(() => setPressed(null), FALLBACK_MS)
        return () => window.clearTimeout(fallback)
    }, [pressed])

    const press = (index: number) => (event: MouseEvent) => {
        if (
            event.metaKey ||
            event.ctrlKey ||
            event.shiftKey ||
            event.altKey ||
            event.button !== 0
        ) {
            return
        }
        setPressed(index)
    }

    return { current: pressed ?? routeIndex, press }
}
