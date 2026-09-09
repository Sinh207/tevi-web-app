'use client'

import { usePathname, useSearchParams } from 'next/navigation'
import { useCallback } from 'react'

export type ChannelTabId = 'posts' | 'media' | 'live' | 'about'

/**
 * The selected tab, kept in the URL as `?tab=`.
 *
 * ## Why the URL and not local state
 *
 * `brand-assets-tabs.tsx` deliberately keeps its tab state local, and its comment says what would
 * change that: *"a `?tab=` would need the panel ids to become part of the page's public contract,
 * and this page has no such links pointing into it yet"*. This page does. Legacy already deep-links
 * it (its creator hook seeds `tabActive` from `router.query.tab` and re-syncs on change), and
 * legacy's `?action=custom_profile` / `?action=become_a_member` still resolve in the same query
 * string (`parseChannelIntent` reads them; `proxy.ts` no longer writes them, because those two are
 * routes of their own now). These search params are already the page's contract.
 *
 * One deviation from legacy, deliberate: legacy reads `?tab=` **only for the owner**, so a shared
 * `/@ada?tab=media` link silently opens Posts for everyone else. Here it works for both — a link to
 * someone's photos is an obviously useful thing to send.
 *
 * ## `history.replaceState`, not `router.replace`
 *
 * Two separate reasons, and the first is the expensive one.
 *
 * **`router.replace` would re-run the server component on every tab tap.** The page reads
 * `searchParams` (it has to — the canonical redirect must preserve the query), which makes the route
 * dynamically rendered, so any Next navigation to a new query string fetches a fresh RSC payload and
 * re-renders the page on the server. Changing a tab is a client concern; paying a server round trip
 * for it is pure waste. Next syncs `useSearchParams` with native history calls, so
 * `window.history.replaceState` updates the URL and this hook's own reading of it while touching
 * nothing else.
 *
 * **`replaceState`, not `pushState`.** Legacy never wrote the param at all, so switching tabs never
 * built history — and the bar's back button has to go on meaning "leave this channel" rather than
 * "walk back through four tab taps".
 *
 * It also sidesteps scroll restoration entirely: there is no navigation, so nothing tries to move the
 * viewport, and no `scroll: false` is needed.
 */
export function useChannelTab(available: ChannelTabId[]) {
    const pathname = usePathname()
    const searchParams = useSearchParams()

    const requested = searchParams.get('tab')
    /**
     * Validated against the tabs that actually exist, falling back to the first.
     *
     * Two things this handles: `?tab=nonsense` must not blank the page, and `?tab=live` on someone
     * else's channel must not select a tab that is not rendered — which is how legacy's owner-only
     * reading is preserved without an ownership check here.
     */
    const active = (
        requested && available.includes(requested as ChannelTabId) ? requested : available[0]
    ) as ChannelTabId

    const setActive = useCallback(
        (next: string) => {
            const params = new URLSearchParams(searchParams.toString())
            // The default tab needs no param — a bare `/@ada` is the cleaner URL to copy, and it is
            // what a crawler should see as canonical.
            if (next === available[0]) params.delete('tab')
            else params.set('tab', next)
            const query = params.toString()
            /**
             * The selected tab is read back out of `useSearchParams`, so this write *is* the state
             * update — there is no local copy to keep in sync. That relies on Next integrating native
             * history calls into its router, which it documents and which is the whole reason this
             * approach works. If a tab ever stops responding to a click, this is the line to check
             * first: the symptom of that integration breaking is a URL that changes and a UI that
             * does not.
             */
            window.history.replaceState(null, '', query ? `${pathname}?${query}` : pathname)
        },
        [available, pathname, searchParams],
    )

    return { active, setActive }
}
