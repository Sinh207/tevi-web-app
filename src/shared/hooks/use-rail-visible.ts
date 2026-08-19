'use client'

import { useEffect, useState } from 'react'

/**
 * The width below which the end rail has no room — `2 × --end-rail-anchor`. The same number the
 * `min-[1292px]:` gate in `app-end-rail.tsx` uses, and the arithmetic behind it is on the token in
 * `globals.css`.
 */
export const END_RAIL_MIN_WIDTH = 1292

/**
 * Whether the rail is actually on screen.
 *
 * **Layout does not need this** — the rail hides itself with `min-[1292px]:`, in CSS, so its markup
 * is server-rendered and appears with the first paint. What needs it is *work*: the rail is still
 * mounted on a phone, so its children still run their hooks, and `useCampaigns` would fetch
 * `dapp-campaign` on every mobile visit for three cards nobody can see.
 *
 * `false` until the effect runs, which is also the honest SSR answer — the server does not know the
 * viewport. That costs nothing visible: the campaign cards need a round trip regardless, so they
 * could never have been in the first paint.
 *
 * Same shape as `use-mobile.ts` beside it — `matchMedia` in an effect, seeded so the first client
 * render matches the server's.
 *
 * ## Why it is in `shared/` and not with the rail it is named after
 *
 * Two features ask the question and they may not import each other. The rail owns the geometry;
 * **`features/channel` owns the consequence** — its campaign strip is the same two cards, so it
 * renders only where the rail cannot (`channel-campaign-banners.tsx`) and a creator is offered a
 * campaign in exactly one place at every width. Reaching for the hook across
 * `features/channel` → `@features/navigation` would close the cycle `profile-top-bar.tsx`
 * documents, so the shared half lives here.
 *
 * **It is a gate on work, and now also on duplication.** Keep those two uses in mind before
 * changing it: the rail uses it to avoid fetching for a column a phone cannot show, the channel
 * strip uses it to avoid printing the same campaign twice on one screen.
 */
export function useRailVisible(): boolean {
    const [visible, setVisible] = useState(false)

    useEffect(() => {
        const mq = window.matchMedia(`(min-width: ${END_RAIL_MIN_WIDTH}px)`)
        const update = () => setVisible(mq.matches)
        update()
        mq.addEventListener('change', update)
        return () => mq.removeEventListener('change', update)
    }, [])

    return visible
}
