import { readCountryHeader } from '@shared/lib/geo'
import { type NextRequest, NextResponse } from 'next/server'

/**
 * The caller's public IP and country, as the edge saw them — legacy's `pages/api/country.js`.
 *
 * **One consumer, one reason.** QR sign-in prints this inside the code so the native app can show
 * "sign in from 203.0.113.4?" before approving a session — see `lib/device-link.ts` for why those
 * few words are the only defence that flow has. The browser cannot know its own public address, so
 * something server-side has to say, and this is the smallest thing that can.
 *
 * A route handler rather than a header read in a layout: the QR panel is a client component that
 * asks for this at the moment it opens, long after any render that could have passed it down, and
 * threading a per-request IP through the RSC payload of **every** page to serve one dialog is the
 * opposite trade.
 *
 * The header order is legacy's `pages/api/country`, which is what the deployment's proxies
 * actually set. `x-forwarded-for` is a list, client first; it is also trivially spoofed by the
 * caller, so this is a **display** value and nothing may be authorised on it.
 *
 * ## The country half, and why it is a *fallback* here
 *
 * `country` was deliberately absent while nothing read it. `/my-wallet/setup-payouts` now does: it
 * preselects the billing country instead of asking a creator which country their bank is in.
 *
 * That value normally never comes from this endpoint — `(web)/layout.tsx` reads the same header
 * during the document render, so the country is in the first paint and costs no request at all. This
 * is what answers when that read came back empty *and* something still wants to ask, which is the
 * case a client-side navigation into a page cannot re-render its way out of. `CountryProvider` calls
 * it at most once per session.
 *
 * Like the IP, it is a **hint** (`shared/lib/geo.ts` states the rule): both headers are set by
 * something in front of the app and both can be sent by the caller, so nothing may be authorised,
 * priced or hidden on either.
 */

/** Never prerendered, never cached: the answer is per-request by definition. */
export const dynamic = 'force-dynamic'

export function GET(request: NextRequest) {
    const headers = request.headers
    const forwarded = headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    const ip = forwarded || headers.get('x-real-ip') || headers.get('cf-connecting-ip') || ''

    /*
     * `null` rather than `''` for an unknown country, and it is not cosmetic: the client parses this
     * with `normalizeCountryCode`, and an empty string is the one falsy value a `??` chain further
     * down the line would have carried as an answer. `null` cannot be mistaken for a country.
     */
    const country = readCountryHeader(headers)

    return NextResponse.json({ ip, country }, { headers: { 'cache-control': 'no-store' } })
}
