'use client'

import { useEffect, useState } from 'react'

/** The two platforms Tevi ships an app for, or `null` when this is not one of them. */
export type MobilePlatform = 'ios' | 'android'

/**
 * Which mobile platform is reading, if either.
 *
 * `null` **on the server and on the first client render**, and then the real answer — the same
 * shape, and for the same reason, as `useMayAnimate`: the server cannot know, so a hook that
 * answered during render would put one thing in the HTML and another in the hydrated tree. Callers
 * therefore treat `null` as "not a phone" and render the desktop affordance first, which is the
 * safe way round: a desktop reader shown two store badges has lost nothing, a phone reader shown
 * them for one frame has lost nothing either.
 *
 * Sniffing the UA at all is a last resort, and this is one of the cases that earns it: the decision
 * is *which store listing to open*, which no feature query can answer. It is deliberately not
 * `react-device-detect` — legacy's dependency, a whole UA database — for one boolean.
 *
 * **iPadOS is the trap.** Since iPadOS 13 an iPad reports itself as `Macintosh`, so a `/iPad/` test
 * quietly stopped matching it years ago. The touch-point check is what catches it: a Mac reports
 * `maxTouchPoints` of 0, an iPad reports 5.
 */
export function useMobilePlatform(): MobilePlatform | null {
    const [platform, setPlatform] = useState<MobilePlatform | null>(null)

    useEffect(() => {
        const ua = navigator.userAgent
        if (/android/i.test(ua)) {
            setPlatform('android')
            return
        }
        const isIpadOs = /Macintosh/.test(ua) && navigator.maxTouchPoints > 1
        if (/iPad|iPhone|iPod/.test(ua) || isIpadOs) setPlatform('ios')
    }, [])

    return platform
}
