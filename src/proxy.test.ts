import { NextRequest } from 'next/server'
import { describe, expect, it } from 'vitest'
import { proxy } from './proxy'

/**
 * `proxy` runs **before route resolution**, which is what makes a wrong entry in it invisible: the
 * page compiles, the URL answers, and a different screen comes back. That happened — the legacy
 * redirect for `/my-wallet/transaction-history` was written when no such route existed, so the day
 * the page shipped it was silently shadowed and served `/my-wallet` under the new URL's address.
 *
 * So the cases pinned here are the ones where a redirect and a real route share a path. This is not
 * a test of the whole proxy: the webview header contract has its own tests in
 * `shared/config/webview.test.ts`, and CSP has `shared/config/csp.test.ts`.
 */
function get(url: string) {
    // A document request — `withCsp` only builds a policy for one, and `Sec-Fetch-Dest` is what it
    // reads. It makes no difference to a redirect, but it keeps these requests shaped like the real
    // ones rather than like fetches.
    return new NextRequest(new URL(url, 'https://tevi.com'), {
        headers: { 'sec-fetch-dest': 'document' },
    })
}

/** The path a rewrite renders, or `null` when the response is not one. */
function rewriteTarget(response: Response): string | null {
    // `NextResponse.rewrite` says so with this header rather than a status — from the outside a
    // rewritten request is an ordinary 200, which is the whole point of using one here.
    const target = response.headers.get('x-middleware-rewrite')
    return target ? new URL(target).pathname : null
}

/** Where a response sends the reader, or `null` when it lets the request through. */
function redirectTarget(response: Response): string | null {
    if (response.status < 300 || response.status >= 400) return null
    const location = response.headers.get('location')
    return location ? new URL(location).pathname + new URL(location).search : null
}

describe('proxy — the ledger paths', () => {
    it('serves /my-wallet/transaction-history rather than redirecting it', () => {
        // The regression. A redirect here shadows the page that owns this address.
        expect(redirectTarget(proxy(get('/my-wallet/transaction-history')))).toBeNull()
        expect(redirectTarget(proxy(get('/my-wallet/transaction-history/')))).toBeNull()
    })

    it('keeps serving it when the query is anything but the Star ledger', () => {
        expect(redirectTarget(proxy(get('/my-wallet/transaction-history?type=payout')))).toBeNull()
        expect(redirectTarget(proxy(get('/my-wallet/transaction-history?currency=usd')))).toBeNull()
    })

    it('still moves the Star half to /my-star, and drops the query that chose it', () => {
        // Legacy's Star ledger has no page of its own — it is a section of `/my-star` — so this half
        // is a genuine move. `?currency=tvs` is exactly what the new address encodes, hence no query.
        expect(redirectTarget(proxy(get('/my-wallet/transaction-history?currency=tvs')))).toBe(
            '/my-star',
        )
        expect(redirectTarget(proxy(get('/my-wallet/transaction-history?currency=TVS')))).toBe(
            '/my-star',
        )
    })

    it('leaves /my-wallet itself alone', () => {
        // The design narrowed this address rather than moving it, and the mobile apps link to it.
        expect(redirectTarget(proxy(get('/my-wallet')))).toBeNull()
    })
})

describe('proxy — the space deep links', () => {
    /**
     * The same regression as the ledger above, in the direction that is easy to re-introduce.
     *
     * These two paths used to be redirects to `/@{slug}?action=…`, matching legacy. They are real
     * routes now, and a redirect in front of a real route is invisible from the code that renders
     * it: the page compiles, the URL answers, and the reader never reaches it.
     */
    it('serves the donation and membership deep links rather than redirecting them', () => {
        expect(redirectTarget(proxy(get('/@ada/direct-donation')))).toBeNull()
        expect(redirectTarget(proxy(get('/@ada/membership')))).toBeNull()
        expect(redirectTarget(proxy(get('/@ada/membership/12')))).toBeNull()
    })

    /** The old rule matched only a literal `@`, so this spelling used to miss it and 404. */
    it('serves the percent-encoded spelling too', () => {
        expect(redirectTarget(proxy(get('/%40ada/direct-donation')))).toBeNull()
    })

    /** Legacy's query spelling is not a proxy concern at all — the page reads it. */
    it('leaves ?action= alone', () => {
        expect(redirectTarget(proxy(get('/@ada?action=direct_donation')))).toBeNull()
        expect(rewriteTarget(proxy(get('/@ada?action=become_a_member')))).toBeNull()
    })
})

describe('proxy — the add-to-home-screen screen', () => {
    /**
     * `/@ada?startapp&addToHomeScreen` is legacy's instruction screen, and the URL is the contract:
     * legacy's manifest pointed installs at it and shared links carry it. A **rewrite** is what
     * keeps that address while rendering a route outside the shell — a redirect would move the
     * reader off the space's URL, and rendering it in place would put our own tab bar over the
     * "bottom bar" step 1 tells them to look at.
     */
    it('renders the guide for the channel URL carrying both markers', () => {
        expect(rewriteTarget(proxy(get('/@ada?startapp&addToHomeScreen')))).toBe(
            '/add-home-screen/@ada',
        )
        /*
         * Bare markers, which is how legacy writes them (`'startapp' in query`) — so the value is
         * the empty string and any test on a value would miss. Order does not matter either.
         *
         * The trailing slash survives: `NextURL` re-applies the request's own to whatever pathname
         * is assigned. It costs nothing — measured against the dev server, `/@ada/?…` answers a 308
         * to the slash-less URL (`trailingSlash: false`) and *that* request rewrites cleanly.
         */
        expect(rewriteTarget(proxy(get('/@ada/?addToHomeScreen&startapp')))).toBe(
            '/add-home-screen/@ada/',
        )
        // The `@` may arrive percent-encoded; `parseChannelSlug` decodes the segment downstream.
        expect(rewriteTarget(proxy(get('/%40ada?startapp&addToHomeScreen')))).toBe(
            '/add-home-screen/%40ada',
        )
    })

    /**
     * `?startapp` alone is what an **installed** space launches with (`channelStartUrl`), so it has
     * to render the space itself. This is the assertion that keeps a home-screen icon from opening
     * the instructions for creating it.
     */
    it('leaves the space alone without both markers', () => {
        expect(rewriteTarget(proxy(get('/@ada?startapp')))).toBeNull()
        expect(rewriteTarget(proxy(get('/@ada?addToHomeScreen')))).toBeNull()
        expect(rewriteTarget(proxy(get('/@ada')))).toBeNull()
    })

    /**
     * The `@` is required, exactly as it is for the two `REDIRECTS` above: without it the pattern
     * matches every single-segment path, and `/settings?startapp&addToHomeScreen` would render a
     * space's instruction screen for a route that is not a space.
     */
    it('needs a channel URL, not any single segment', () => {
        expect(rewriteTarget(proxy(get('/settings?startapp&addToHomeScreen')))).toBeNull()
        expect(rewriteTarget(proxy(get('/?startapp&addToHomeScreen')))).toBeNull()
        // Two segments is a sub-page of a space, not the space.
        expect(rewriteTarget(proxy(get('/@ada/event?startapp&addToHomeScreen')))).toBeNull()
    })

    /** The screen's own address answers directly too, and must not be rewritten onto itself. */
    it('does not rewrite the route it rewrites onto', () => {
        expect(rewriteTarget(proxy(get('/add-home-screen/@ada')))).toBeNull()
    })
})

describe('proxy — what search engines are told', () => {
    it('moves a legacy path with a permanent redirect', () => {
        // A 307 asks a crawler to keep the old URL indexed and to come back to it.
        expect(proxy(get('/privacy/miniapp')).status).toBe(308)
    })

    it('says noindex in a header on every route robots.txt used to disallow', () => {
        for (const path of ['/app', '/app/privacy', '/my-space', '/login', '/signup']) {
            expect(proxy(get(path)).headers.get('x-robots-tag'), path).toBe('noindex')
        }
    })

    it('says it on the add-to-home-screen rewrite, which keeps the space address', () => {
        // The request URL is the space's own; only the rewrite target says what is rendered.
        expect(proxy(get('/@ada?startapp&addToHomeScreen')).headers.get('x-robots-tag')).toBe(
            'noindex',
        )
        expect(proxy(get('/add-home-screen/@ada')).headers.get('x-robots-tag')).toBe('noindex')
    })

    it('leaves indexable pages alone', () => {
        for (const path of ['/', '/@ada', '/@ada?startapp', '/premium', '/application']) {
            expect(proxy(get(path)).headers.get('x-robots-tag'), path).toBeNull()
        }
    })
})

describe('proxy — ?lang= on the website', () => {
    it('renders the language the URL names, and keeps the reader in it', () => {
        const response = proxy(get('/premium?lang=vi'))
        // The request header the root layout reads — on the forwarded request, not the response.
        expect(response.headers.get('x-middleware-request-x-tevi-url-locale')).toBe('vi')
        expect(response.cookies.get('tevi.locale')?.value).toBe('vi')
    })

    it('writes the cookie on the domain the language switcher uses, so there is one of it', () => {
        // Host-only here and `.tevi.com` from the switcher is two cookies of one name.
        expect(proxy(get('/premium?lang=vi')).headers.get('set-cookie')).toContain(
            'Domain=.tevi.com',
        )
    })

    it('ignores a language it does not ship, and a client claiming the header', () => {
        const forged = new NextRequest(new URL('/premium?lang=fr', 'https://tevi.com'), {
            headers: { 'x-tevi-url-locale': 'ko' },
        })
        const response = proxy(forged)
        expect(response.headers.get('x-middleware-request-x-tevi-url-locale')).toBeNull()
        expect(response.cookies.get('tevi.locale')).toBeUndefined()
    })
})
