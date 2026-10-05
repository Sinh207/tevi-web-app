'use client'

import { inAppReferrer } from '@shared/lib/in-app-referrer'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useRef } from 'react'
import type { Channel } from '../api/types'
import { liveEvents } from '../lib/channel-live'
import { isExternalArrival } from '../lib/live-entry'
import { parseChannelIntent } from '../routes'

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
 *
 * ## The referrer is the app's, not the document's
 *
 * `document.referrer` is set by the page **load** and never by a client-side navigation, so on its
 * own it says "outside" for every in-app arrival after the first page — Following → live → back
 * to the space read as an outside arrival and forwarded straight into the live again, a loop with
 * no way out. `inAppReferrer` is the route the app itself was on; `document.referrer` only answers
 * when this space is the document's first page.
 *
 * And a space is forwarded **at most once per document** (`forwarded`): whatever a referrer says,
 * a second forward into the same live is a reader being sent somewhere they have already left.
 *
 * ## A deep link outranks it
 *
 * `/@ada/direct-donation` is a stated intent; being on air is a fact about the space. Sending
 * someone who followed a donation link into a live room answers a question they did not ask, and
 * the dialog they came for never opens — it is mounted on the space page they were taken off.
 *
 * This is not new behaviour being fixed so much as newly visible: legacy's `?action=` deep links
 * were swallowed the same way, silently, because nothing on the way in could tell an intent from an
 * ordinary arrival. The intent is only **read** here, never consumed — the control that owns the
 * dialog is the one that spends it.
 */
/** Spaces this document has already forwarded into their live — see "at most once" above. */
const forwarded = new Set<string>()

export function ChannelLiveRedirect({ channel }: { channel: Channel }) {
    const router = useRouter()
    const pathname = usePathname()
    const searchParams = useSearchParams()
    const fired = useRef(false)
    const deepLinked = parseChannelIntent(pathname, searchParams) !== null

    useEffect(() => {
        if (fired.current || deepLinked) return
        const live = liveEvents(channel)[0]
        if (!live?.code) return
        const key = channel.slug.toLowerCase()
        if (forwarded.has(key)) return
        const origin = window.location.origin
        const fromApp = inAppReferrer(pathname)
        if (
            !isExternalArrival({
                referrer: fromApp ? `${origin}${fromApp}` : document.referrer,
                origin,
                slug: channel.slug,
            })
        ) {
            return
        }
        fired.current = true
        forwarded.add(key)
        router.replace(`/@${channel.slug}/event/${encodeURIComponent(live.code)}`)
    }, [channel, deepLinked, pathname, router])

    return null
}
