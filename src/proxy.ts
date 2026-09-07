import { buildCsp, CSP_REPORT_ONLY, generateNonce, NONCE_HEADER } from '@shared/config/csp'
import {
    isWebviewPath,
    parseWebviewParams,
    WEBVIEW_HEADERS,
    WEBVIEW_THEME_COOKIE,
} from '@shared/config/webview'
import { COOKIE_NAME as LOCALE_COOKIE } from '@shared/i18n/settings'
import { type NextRequest, NextResponse } from 'next/server'

/**
 * Legacy URL rewrites (ported from the old app). No auth here — auth is client-side.
 *
 * **The `@` is required.** Without it these patterns match *any* two-segment path, so
 * `/foo/direct-donation` bounces to `/foo?action=direct_donation` and then 404s — two requests and a
 * bogus URL in history, and a redirect that works as a probe for arbitrary paths. Channel URLs always
 * carry the `@` (see `features/channel/lib/channel-slug.ts` for why the namespace depends on it), so
 * requiring it here costs nothing and keeps the rule honest.
 *
 * Note there is deliberately **no** `/{slug}` → `/@{slug}` rule. Proxy runs before route resolution,
 * so a pattern like `/^\/([^/]+)$/` would swallow `/following`, `/search`, `/settings` and every
 * future single-segment static route before Next ever resolved them — a failure that only surfaces
 * the day someone ships one of those and finds it permanently unreachable.
 */
const REDIRECTS: { pattern: RegExp; action: string }[] = [
    { pattern: /^\/(@[^/]+)\/direct-donation$/, action: 'direct_donation' },
    { pattern: /^\/(@[^/]+)\/membership\/[^/]+$/, action: 'become_a_member' },
]

/**
 * Legacy paths that moved to a different path in this app.
 *
 * A second list rather than a widening of `REDIRECTS`: that one exists to turn a channel sub-path
 * into `/@{slug}?action=…`, so every entry needs a capture group and a query parameter. These are
 * plain path-to-path moves with neither, and folding them in would mean a discriminated union in a
 * loop that currently reads in one glance.
 *
 * **`/my-wallet` itself is not here.** It still exists — the design kept the address and narrowed
 * it to the earnings half (`features/balance/routes.ts` says why), and the mobile apps link to it.
 * What moved is the *Star* half:
 *
 * - legacy's Star ledger lived at `/my-wallet/transaction-history?currency=tvs`, and the currency
 *   ledger at the same path without the parameter. **Only the Star half still moves**: the currency
 *   ledger has its own route again (`/my-wallet` shows recent movements under a *View all* link, and
 *   that path shows all of them with the filter), so a redirect there would now shadow a real page.
 *   The Star ledger has no page of its own — it is on `/my-star` — so that half is still a move.
 * - `/get-star` needs no entry at all: this app serves that **same path**, so there is nothing to
 *   move. The payout screens are still **not** redirected — they have no destination yet, and a
 *   redirect would send somebody from a URL that used to work to a 404. They 404 on their own until
 *   that pass lands, which is at least the truth.
 *
 * The search string is dropped on redirect (`url.search = ''`), because the parameter that chose
 * the ledger is exactly what the new address encodes.
 */
const PATH_REDIRECTS: {
    from: RegExp
    to: (search: URLSearchParams) => string
    /**
     * Only redirect when this says so. Omitted means "always", which is what a plain path move
     * is; the one entry that needs it shares its path with a page this app serves.
     */
    when?: (search: URLSearchParams) => boolean
    /**
     * Keep the query string. Off by default, because the Star entry below *is* the query: the
     * parameter that chose the ledger is exactly what the new address encodes, so carrying
     * it forward would leave a `?currency=tvs` on a URL where it means nothing. A plain
     * path move has no such story — the params belong to the reader, not to the old path.
     */
    keepSearch?: boolean
}[] = [
    /*
     * Note the `when`: without it this entry matched the bare path too and redirected
     * `/my-wallet/transaction-history` — a **real route** — to `/my-wallet`. A redirect that
     * shadows a page is invisible from the code that renders it: the page compiles, the URL
     * answers 200, and what comes back is a different screen.
     */
    {
        from: /^\/my-wallet\/transaction-history\/?$/,
        when: search => search.get('currency')?.toLowerCase() === 'tvs',
        to: () => '/my-star',
    },
    /*
     * The two mini app legal documents. These paths are the *webview* app's
     * (`tevi-web-view`, which served them at `/privacy/miniapp` and `/tos/miniapp`), not
     * this site's, and shipped app builds still hold them. They keep their query on the way
     * over: an app opens a legal screen with `?lang=&theme=`, and that context is the
     * reader's regardless of which spelling of the path they arrived on.
     *
     * Only the slug is hyphenated — `/tos` stays `/tos`. That namespace is the mini app
     * terms' own on both legacy sites, and `/terms` is this site's terms of use.
     */
    { from: /^\/privacy\/miniapp\/?$/, to: () => '/privacy/mini-app', keepSearch: true },
    { from: /^\/tos\/miniapp\/?$/, to: () => '/tos/mini-app', keepSearch: true },
]

/** A year — the app re-sends the params on every open, so this is only a fallback. */
const WEBVIEW_COOKIE_MAX_AGE = 60 * 60 * 24 * 365

const CSP_HEADER = 'content-security-policy'
/** The Trusted Types trial — see `CSP_REPORT_ONLY`. Reports, never blocks. */
const CSP_REPORT_ONLY_HEADER = 'content-security-policy-report-only'

/**
 * Only documents get a CSP.
 *
 * The policy governs what a *page* may load; on a PNG or the web manifest it protects
 * nothing, and the per-request nonce it carries would make otherwise-static routes
 * (`/icon.svg`, `/manifest.webmanifest`) vary per request for no gain. The
 * origin-wide headers in `next.config.ts` — HSTS, `nosniff`, `X-Frame-Options` — still
 * cover every response.
 */
function isDocumentRequest(request: NextRequest): boolean {
    return request.headers.get('accept')?.includes('text/html') ?? false
}

/**
 * Attach the policy to the request *and* the response.
 *
 * The request copy is not redundant: Next reads the nonce back out of it to stamp its own
 * script tags. Skip it and the framework's bootstrap is blocked by our own policy.
 */
function withCsp(request: NextRequest, headers: Headers): string | null {
    // Never trust a nonce the caller supplied — see NONCE_HEADER.
    headers.delete(NONCE_HEADER)
    if (!isDocumentRequest(request)) return null
    const nonce = generateNonce()
    const csp = buildCsp({ nonce, isDev: process.env.NODE_ENV !== 'production' })
    headers.set(CSP_HEADER, csp)
    headers.set(NONCE_HEADER, nonce)
    return csp
}

export function proxy(request: NextRequest) {
    const { pathname } = request.nextUrl

    // Strip the webview headers off every incoming request before anything can read
    // them: they are ours to set, and a client must not be able to claim webview
    // context on a normal page.
    const headers = new Headers(request.headers)
    for (const header of Object.values(WEBVIEW_HEADERS)) headers.delete(header)

    const csp = withCsp(request, headers)

    if (isWebviewPath(pathname)) return withWebviewContext(request, headers, csp)

    // Dev-only tooling (/dev/icons and friends). The pages call notFound()
    // themselves, but that leaves the response at 200 on a dynamic route, so
    // stop the request here to get a real 404.
    if (pathname === '/dev' || pathname.startsWith('/dev/')) {
        if (process.env.NODE_ENV === 'production') {
            return new NextResponse(null, { status: 404 })
        }
    }

    for (const { pattern, action } of REDIRECTS) {
        const match = pathname.match(pattern)
        if (match) {
            const channelSlug = match[1]
            const url = request.nextUrl.clone()
            url.pathname = `/${channelSlug}`
            url.searchParams.set('action', action)
            return NextResponse.redirect(url)
        }
    }

    for (const { from, to, when, keepSearch } of PATH_REDIRECTS) {
        if (!from.test(pathname)) continue
        if (when && !when(request.nextUrl.searchParams)) continue
        const url = request.nextUrl.clone()
        url.pathname = to(request.nextUrl.searchParams)
        if (!keepSearch) url.search = ''
        return NextResponse.redirect(url)
    }

    const response = NextResponse.next({ request: { headers } })
    if (csp) {
        response.headers.set(CSP_HEADER, csp)
        response.headers.set(CSP_REPORT_ONLY_HEADER, CSP_REPORT_ONLY)
    }
    return response
}

/**
 * `/app/*` is the mobile app's webview namespace (see `shared/config/webview.ts`). The
 * app owns the presentation context, so it sends it on the URL: this lifts `?lang=` and
 * `?theme=` into request headers `app/layout.tsx` reads while rendering, which is what
 * makes the first paint already the right language, direction and theme — no flash, no
 * client round-trip.
 *
 * The same values are also written as cookies, because a client-side navigation *inside*
 * the webview arrives without the entry URL's params.
 */
function withWebviewContext(request: NextRequest, headers: Headers, csp: string | null) {
    const context = parseWebviewParams(request.nextUrl.searchParams)

    headers.set(WEBVIEW_HEADERS.flag, '1')
    // Fall back to what a previous screen persisted, so params only have to be on the
    // URL the app opens, not on every link the user then taps.
    const locale = context.locale ?? request.cookies.get(LOCALE_COOKIE)?.value
    const theme = context.theme ?? request.cookies.get(WEBVIEW_THEME_COOKIE)?.value
    if (locale) headers.set(WEBVIEW_HEADERS.locale, locale)
    if (theme) headers.set(WEBVIEW_HEADERS.theme, theme)
    if (context.platform) headers.set(WEBVIEW_HEADERS.platform, context.platform)
    if (context.version) headers.set(WEBVIEW_HEADERS.version, context.version)

    const response = NextResponse.next({ request: { headers } })
    if (csp) {
        response.headers.set(CSP_HEADER, csp)
        response.headers.set(CSP_REPORT_ONLY_HEADER, CSP_REPORT_ONLY)
    }
    const options = { path: '/', maxAge: WEBVIEW_COOKIE_MAX_AGE, sameSite: 'lax' } as const
    if (context.locale) response.cookies.set(LOCALE_COOKIE, context.locale, options)
    if (context.theme) response.cookies.set(WEBVIEW_THEME_COOKIE, context.theme, options)
    return response
}

export const config = {
    matcher: ['/((?!api|_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)'],
}
