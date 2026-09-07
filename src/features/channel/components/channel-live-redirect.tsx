'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useRef } from 'react'
import type { Channel } from '../api/types'
import { liveEvents } from '../lib/channel-live'
import { isExternalArrival } from '../lib/live-entry'

/**
 * Takes a visitor who arrived **from outside** at a space that is **on air** straight to the live.
 *
 * Renders nothing. It is a component rather than a hook so the space page can mount it beside the
 * header without threading a return value nobody reads.
 *
 * ## The one case that must not redirect
 *
 * A reader who just pressed back out of this space's own live. `isExternalArrival` is where that is
 * decided — and the reason `document.referrer` is read here in an effect rather than during render:
 * the server cannot know it, so reading it while rendering is a hydration mismatch, and "stay" is
 * the honest thing for the server to render.
 *
 * ## `replace`, not `push`
 *
 * The profile must not become a step in the history. With `push`, back from the live lands on the
 * profile, which redirects into the live again — the loop this whole file is careful about, rebuilt
 * out of history entries instead of effects. `replace` leaves whatever they came from as the back
 * target.
 *
 * The ref guard is for React's development double-effect, which would otherwise fire the navigation
 * twice.
 */
export function ChannelLiveRedirect({ channel }: { channel: Channel }) {
    const router = useRouter()
    const fired = useRef(false)

    useEffect(() => {
        if (fired.current) return
        const live = liveEvents(channel)[0]
        if (!live?.code) return
        if (
            !isExternalArrival({
                referrer: document.referrer,
                origin: window.location.origin,
                slug: channel.slug,
            })
        ) {
            return
        }
        fired.current = true
        router.replace(`/@${channel.slug}/event/${encodeURIComponent(live.code)}`)
    }, [channel, router])

    return null
}
