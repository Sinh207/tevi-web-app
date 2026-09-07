'use client'

import { useEffect, useState } from 'react'

/**
 * `true` once the client has decided a looping animation may play at all.
 *
 * Starts `false` **on the server and on the first client render**, which is what keeps hydration
 * honest: the server cannot know either of these answers, so both sides render the still and the
 * video is an upgrade applied in an effect. Reading `matchMedia` during render would produce a
 * server/client mismatch instead.
 *
 * Shared by `AnimatedAvatar` (an avatar's video loop) and `ChannelLiveBadge` (a Lottie), because
 * the decision is about the reader, not about the medium: somebody who has asked for less motion
 * has asked once, and a page that stills the avatar while a badge keeps pulsing next to it has
 * only half-listened.
 */
export function useMayAnimate(): boolean {
    const [mayAnimate, setMayAnimate] = useState(false)

    useEffect(() => {
        const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
        // `saveData` is non-standard and absent on Safari/Firefox; absent means "no preference
        // expressed", which is not the same as "wants to save data".
        const saveData =
            (navigator as Navigator & { connection?: { saveData?: boolean } }).connection
                ?.saveData === true

        const update = () => setMayAnimate(!reduceMotion.matches && !saveData)
        update()
        // The setting can change while the page is open, and an avatar that keeps looping after
        // someone turns reduced-motion on has ignored them.
        reduceMotion.addEventListener('change', update)
        return () => reduceMotion.removeEventListener('change', update)
    }, [])

    return mayAnimate
}
