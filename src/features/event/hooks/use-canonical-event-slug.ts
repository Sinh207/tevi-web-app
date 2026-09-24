'use client'

import { useEffect } from 'react'
import { eventPath } from '../routes'

/**
 * Collapse the handle in the address bar onto the one the **event's own payload** names.
 *
 * An event is addressed by its `code`, which is globally unique. The `@handle` in front of it
 * identifies nothing — it is there so the URL reads as a creator's, and the page renders identically
 * whatever it says. So the two can disagree, and routinely do: a creator renames their space and
 * every poster, QR code and forwarded message still carries the old handle; a link is retyped with
 * different casing; a share tool lowercases the path on the way through.
 *
 * ## The server already does this, and cannot do all of it
 *
 * `[code]/page.tsx` calls `permanentRedirect` when it can, which is the better answer wherever it is
 * possible — it corrects the URL before a single byte of this page's JS runs. (⚠ It does not reach
 * the wire as a 308; that route's own note has the measurement and why. It still redirects.) But it
 * can only compare what it has, and there are two renders where it has nothing:
 *
 * - **the `unavailable` path.** A 5xx or a timeout from `v4/public/events/{code}/` renders the page
 *   with no event at all, deliberately — see that route's doc. The client's own fetch then succeeds
 *   and is the first moment anybody knows what the canonical handle is.
 * - **a client-side navigation into the route.** No server render happened, so no comparison did.
 *
 * In both, the page ends up correct and its URL does not. That is not cosmetic: the address bar is
 * what a reader copies, and `features/share` builds from the event rather than the location, so the
 * two would disagree about the same broadcast on the same screen.
 *
 * ## ⚠ `history.replaceState`, not `router.replace` — this is a URL edit, not a navigation
 *
 * `router.replace` shipped here first and it was the wrong tool. `@handle` is a **dynamic segment**,
 * so replacing it is a new path as far as the router is concerned: Next fetches a fresh RSC payload,
 * re-runs the route's server component, and `getEventForRequest` hits `v4/public/events/{code}/`
 * again — a full server round trip and a second upstream request to arrive at a page that is byte
 * for byte the one already on screen. Nothing about the render depends on the handle; the payload
 * that would come back is keyed on `code`, which did not change.
 *
 * `useChannelTab` states the same rule for the same reason one feature over, and settles the doubt
 * that makes people reach for `router.replace` anyway: Next integrates native history calls into its
 * router, so `usePathname` follows a `replaceState` and nothing goes out of sync. (`useParams` would
 * be the exception — it reads the router's own tree rather than the URL — and nothing in this app
 * calls it. If that changes, this is the line to check.)
 *
 * It also sidesteps scroll restoration for free: there is no navigation, so nothing tries to move
 * the viewport.
 *
 * **`replaceState`, not `pushState`.** The handle somebody happened to arrive with is not a step in
 * their history to press back through — pushing it would make *back* re-enter the wrong URL, which
 * this hook would then correct again, and the reader would be trapped on the page.
 *
 * ## Exact comparison, not case-insensitive
 *
 * `/@Ada` and `/@ada` are two URLs, and the canonical spelling is **the creator's own** —
 * `channel-slug.ts` records that legacy redirects `/@noraazima` *to* `/@Noraazima`, not the other
 * way round. `canonicalChannelRedirect` compares exactly for that reason and this matches it, so the
 * space page and the event page under it cannot disagree about which spelling wins.
 *
 * ## It cannot loop
 *
 * After the write, the URL carries the canonical slug — but `requested` is a **prop from the server
 * render** and does not change, precisely because no navigation happened. So the exit condition is
 * the dependency list rather than the comparison: every dependency is a primitive or a module-level
 * function, so a re-render with the same props re-runs nothing. The effect fires once per mount at
 * most, which is all it needs.
 *
 * Nothing fires until the event has landed: `canonical` is null while it is loading, and a null is
 * *unknown*, never *mismatched*. Rewriting the URL from an absent payload would move somebody off an
 * address that may well have been right.
 *
 * @param requested the handle as the URL spells it, already through `parseChannelSlug` (no `@`)
 * @param canonical `event.channel.slug` — null until the event lands, and then authoritative
 * @param path the route builder, `eventPath` or `eventReportPath`. A **module-level** function, so
 *   its identity is stable and the effect's dependency list is honest; an inline lambda here would
 *   re-run it on every render.
 */
export function useCanonicalEventSlug({
    requested,
    canonical,
    code,
    path = eventPath,
}: {
    requested: string
    canonical: string | null | undefined
    code: string
    path?: (slug: string, code: string) => string
}) {
    useEffect(() => {
        if (!canonical || canonical === requested) return
        // Path only — an event URL carries no query this app writes, and `replaceState` takes the
        // whole address, so passing a bare path would silently drop one a link happened to carry.
        window.history.replaceState(null, '', `${path(canonical, code)}${window.location.search}`)
    }, [requested, canonical, code, path])
}
