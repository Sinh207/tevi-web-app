'use client'

import { useEffect, useState } from 'react'
import { isCompactViewport, type Viewport } from '../lib/window-geometry'

/** The live viewport, read only on the client. `null` until the first measurement. */
export function viewportNow(): Viewport {
    return { width: window.innerWidth, height: window.innerHeight }
}

/**
 * The viewport, measured on the **first render** and again on resize.
 *
 * ## Measured in the initialiser, not in an effect
 *
 * Every consumer of this is inside `MiniAppWindow`, which is a `dynamic(..., { ssr: false })`
 * import — so it only ever renders in a browser and `window` is always there. Measuring in an
 * effect instead would cost the player a first render with nothing to lay out against: `null`
 * viewport → render nothing → effect → measure → render again. That empty frame is what an
 * entrance animation has nothing to animate *from*, and it is why the window used to appear a beat
 * after the press.
 *
 * The type keeps `null` anyway. It is not defensive padding: a non-browser render would be a
 * `typeof window === 'undefined'` crash rather than a wrong layout, and the guard states which of
 * the two this is. If this hook is ever used somewhere that *does* server-render, the consumer
 * already handles the case.
 *
 * `md` (900) rather than a `matchMedia` listener because the same numbers feed the geometry
 * arithmetic — one source for "how wide is it", not a boolean beside a measurement that can
 * disagree with it.
 */
export function useViewport(): { viewport: Viewport | null; isCompact: boolean } {
    const [viewport, setViewport] = useState<Viewport | null>(() =>
        typeof window === 'undefined' ? null : viewportNow(),
    )

    useEffect(() => {
        const measure = () => setViewport(viewportNow())
        measure()
        window.addEventListener('resize', measure)
        /*
         * `orientationchange` as well: on iOS the resize event after a rotation can fire before the
         * new dimensions are readable, so a rotation would otherwise leave the window sized for the
         * previous orientation until something else nudged it.
         */
        window.addEventListener('orientationchange', measure)
        return () => {
            window.removeEventListener('resize', measure)
            window.removeEventListener('orientationchange', measure)
        }
    }, [])

    return { viewport, isCompact: viewport ? isCompactViewport(viewport) : false }
}
