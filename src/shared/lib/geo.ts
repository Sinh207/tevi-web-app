/**
 * Which country the visitor is calling from — read off the edge's own header, and nothing else.
 *
 * ## Why the header rather than a lookup
 *
 * The proxy in front of this app already knows: Cloudflare sets `cf-ipcountry` on every request, and
 * the cluster's ingress sets `x-country-code`. Legacy has this exact list in
 * `pages/api/country.js`, so the deployment is known to set at least one of them. That makes the
 * answer **free** — no IP database, no third-party call, no request at all when it is read during the
 * document render.
 *
 * ## It is a *hint*, and never an authorisation
 *
 * Every header here is set by something in front of the app, and a caller can send them too — the
 * same footing as `x-forwarded-for` (see `app/api/client-ip/route.ts`). So this decides which country
 * a **form is prefilled with** and nothing else. Nothing may be granted, priced or hidden on it: the
 * backend already prices payouts per country from the config the account picked, and a VPN would
 * otherwise be a way to shop for one.
 *
 * Pure and free of React and of `server-only` on purpose: the route handler, the `(web)` layout and
 * the client's fallback parser all read the same rule, and a second copy is how the three drift.
 */

/**
 * The headers checked, in order — legacy's own order, which is the order the deployment sets them in.
 *
 * `x-vercel-ip-country` is included for preview deployments, which is where this is most often looked
 * at during a design pass and the one environment with no Cloudflare in front.
 */
export const COUNTRY_HEADERS = ['cf-ipcountry', 'x-country-code', 'x-vercel-ip-country'] as const

/**
 * Codes that are the header saying **"I don't know"**, and must not reach a form.
 *
 * `XX` is Cloudflare's own placeholder for a client with no country; `T1` is what it sends for Tor
 * traffic; `ZZ` is the ISO "unknown" reservation. Treating any of them as a country prefills the
 * billing form with a country that does not exist and — worse for `T1` — one that never will.
 */
const UNKNOWN_CODES = new Set(['XX', 'T1', 'ZZ'])

/**
 * An ISO alpha-2 code, upper-cased — or `null` for anything that is not one.
 *
 * Deliberately strict about the *shape* and silent about the *list*: this does not check the code
 * against a table of real countries, because the only thing it is used for is matching against
 * `payout/countries/`, which is that table. A code that matches nothing there simply does not
 * preselect anything.
 */
export function normalizeCountryCode(value: unknown): string | null {
    if (typeof value !== 'string') return null
    const code = value.trim().toUpperCase()
    if (!/^[A-Z]{2}$/.test(code)) return null
    if (UNKNOWN_CODES.has(code)) return null
    return code
}

/** Anything with a `get(name)` — a `Headers`, or Next's read-only headers. */
export interface HeaderReader {
    get(name: string): string | null | undefined
}

/**
 * The visitor's country from a request's headers, or `null` when nothing said.
 *
 * `null` is a normal answer, not a failure: `pnpm dev` has no proxy in front of it, and so does a
 * deploy behind an ingress that has not been configured to pass the country on. The caller's job is
 * then to *ask* rather than to guess — see `useSetupPayouts`.
 */
export function readCountryHeader(headers: HeaderReader): string | null {
    for (const name of COUNTRY_HEADERS) {
        const code = normalizeCountryCode(headers.get(name))
        if (code) return code
    }
    return null
}
