'use client'

import { useEffect, useState } from 'react'

/**
 * Whether a media query matches — for **work** that depends on the viewport, never for layout.
 * Layout is CSS (`md:`, `min-[1292px]:`), server-rendered and right on the first paint; this is for
 * the hooks that should not run where their output cannot be seen.
 *
 * `false` until the effect runs, which is also the honest SSR answer: the server does not know the
 * viewport, and seeding it `false` keeps the first client render equal to the server's.
 */
export function useMediaQuery(query: string): boolean {
    const [matches, setMatches] = useState(false)

    useEffect(() => {
        const mq = window.matchMedia(query)
        const update = () => setMatches(mq.matches)
        update()
        mq.addEventListener('change', update)
        return () => mq.removeEventListener('change', update)
    }, [query])

    return matches
}
