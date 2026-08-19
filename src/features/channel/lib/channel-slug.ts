/**
 * The `@` in `/@ada` — parsing it, and deciding when a URL has to be redirected.
 *
 * ## Why the `@` is load-bearing
 *
 * Channels live at the **root** of URL space, and that is only safe because of the `@`. The
 * namespace is `/@*`, which is disjoint from every static route the app has or will have: a
 * creator whose slug is `settings` lives at `/@settings` and can never collide with
 * `/settings`. Drop the `@` and the app needs a reserved-slug list, enforced on the backend
 * too, plus a migration for creators who already hold a colliding slug — see the plan's
 * "if we ever drop the `@`" section. Until then this one character does that work.
 *
 * The `@` cannot be a folder name: `app/(main)/@handle/` is a **parallel-route slot** in the
 * App Router and never becomes a URL segment. So the route is `[slug]` and the param arrives
 * carrying the `@`.
 */

/** Slug charset and length. Provisional until B20 — the backend owns the real rule. */
const SLUG_PATTERN = /^[a-zA-Z0-9._-]{1,64}$/

/**
 * The route param, decoded.
 *
 * **Next hands this segment over percent-encoded: `/@sinhpn11` arrives as `"%40sinhpn11"`.** Measured,
 * after an earlier version of this file asserted the opposite in a comment — and that assumption is
 * exactly the bug it caused. `"%40sinhpn11"` does not start with `@`, so every channel URL was
 * rejected before any fetch and the page rendered "This space does not exist" for spaces that exist.
 *
 * Decoding also has to happen for its own sake: `%40ada` is a URL a person can legitimately type or
 * a link can carry, and it means the same channel as `@ada`.
 *
 * `decodeURIComponent` throws on a malformed escape (`%`, `%zz`), which a crafted URL will contain, so
 * the failure is caught and treated as "not a channel URL" rather than a 500.
 */
function decodeParam(param: string): string {
    try {
        return decodeURIComponent(param)
    } catch {
        return param
    }
}

/**
 * The bare slug from a route param, or `null` if this is not a channel URL at all.
 *
 * `null` means **`notFound()` without fetching anything**, which is the point: `/{slug}`
 * matches every unclaimed single-segment path, so every bot probing `/.env`, `/wp-admin` or
 * `/admin.php` would otherwise cost one upstream request. Rejecting here is free.
 *
 * Only the **leading** `@` is stripped. Legacy uses `replaceAll('@', '')`, which turns
 * `@foo@bar` into `foobar` — a *different channel*, silently. That is the bug this function
 * exists to not have.
 *
 * Case is preserved, because the canonical spelling is the creator's own (legacy redirects
 * `/@noraazima` *to* `/@Noraazima`, not the other way round). Comparing case is
 * `canonicalChannelRedirect`'s job, once the real channel is known.
 */
export function parseChannelSlug(param: string | undefined | null): string | null {
    if (typeof param !== 'string') return null
    // Decode first: the router hands the segment over encoded, so `%40ada` is the normal case and
    // `@ada` is what a hand-written test passes. Both have to work — see `decodeParam`.
    const trimmed = decodeParam(param.trim()).trim()
    if (!trimmed.startsWith('@')) return null
    const slug = trimmed.slice(1)
    if (!SLUG_PATTERN.test(slug)) return null
    return slug
}

/**
 * A shareable URL as the header prints it: `tevi.com/@ada`, not `https://tevi.com/@ada`.
 *
 * The DS draws it that way (`preview/space.html` shows `tevi.com/@slug`), and the reason holds up:
 * `https://` is eight characters carrying no information, on the one line of the header where a long
 * slug is most likely to be truncated. A trailing slash goes too, for the same reason.
 *
 * Only ever used for **display** — the `href` keeps the full URL. Falls back to the input unchanged
 * if it will not parse, so a malformed value renders as itself rather than disappearing.
 */
export function displayUrl(url: string): string {
    try {
        const parsed = new URL(url)
        const path = parsed.pathname === '/' ? '' : parsed.pathname.replace(/\/$/, '')
        return `${parsed.host}${path}${parsed.search}`
    } catch {
        return url
    }
}

/** The channel's own URL. The single place the `@` is put back on. */
export function toChannelPath(slug: string): string {
    return `/@${slug}`
}

/**
 * Where to redirect when the URL's spelling is not the channel's canonical one, or `null`
 * when it already is.
 *
 * Slugs are case-insensitive to look up but have one canonical spelling, so `/@ADA` and
 * `/@ada` are the same channel at two URLs. Left alone that splits SEO signals and produces
 * two cache entries; hence a redirect to whichever spelling the API returned.
 *
 * **The query string has to survive.** `permanentRedirect()` does not carry it, and this
 * page's search params are part of its contract — `proxy.ts` rewrites `/@ada/direct-donation`
 * into `/@ada?action=direct_donation`, so dropping the query here would swallow the very
 * intent the visitor arrived with. A lone `?` with nothing after it is dropped rather than
 * reproduced, matching legacy's `buildRedirectDestination`.
 */
export function canonicalChannelRedirect(
    requestedSlug: string,
    canonicalSlug: string,
    search?: string | URLSearchParams | null,
): string | null {
    if (!canonicalSlug || requestedSlug === canonicalSlug) return null

    // Same channel, different spelling. A genuinely different slug should not reach here —
    // the caller looked this channel up *by* the requested slug — but if it does, redirecting
    // to the canonical one is still the right answer.
    const query =
        search instanceof URLSearchParams ? search.toString() : (search ?? '').replace(/^\?/, '')
    return query ? `${toChannelPath(canonicalSlug)}?${query}` : toChannelPath(canonicalSlug)
}
