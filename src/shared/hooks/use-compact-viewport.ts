'use client'

import { useEffect, useState } from 'react'

/**
 * The width legacy calls `matchUpSm` — below it, a popup is a screen rather than a card.
 *
 * `--breakpoint-sm` is 612, which is also the post column's width. Kept as a number here because
 * `matchMedia` takes one; `globals.css` owns the token and this is the one place that restates it.
 */
export const COMPACT_MAX_WIDTH = 612

/**
 * Whether the viewport is too narrow for a centred dialog.
 *
 * ## `false` on the server, and that is the honest answer rather than a guess
 *
 * The server does not know the viewport, so it renders the desktop shape and the effect corrects
 * it. That would be a visible flash for anything in the first paint — it is not, for these: every
 * caller is a **dialog**, and a dialog is opened by a press long after mount. The hook has settled
 * by the time anything it decides is on screen.
 *
 * The same reasoning and the same shape as `use-rail-visible.ts`; the difference is only which
 * question is asked. Do **not** reach for this to decide layout that renders immediately — CSS
 * does that without a round trip through JavaScript, which is why the rail hides itself with
 * `min-[1292px]:` and uses its hook only to gate *work*.
 */
export function useCompactViewport(): boolean {
    const [compact, setCompact] = useState(false)

    useEffect(() => {
        const mq = window.matchMedia(`(max-width: ${COMPACT_MAX_WIDTH - 1}px)`)
        const update = () => setCompact(mq.matches)
        update()
        mq.addEventListener('change', update)
        return () => mq.removeEventListener('change', update)
    }, [])

    return compact
}
