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
 * Legacy paths that moved to a different path in this app. No auth here — auth is client-side.
 *
 * ## What used to be here: `/@{slug}/direct-donation` and `/@{slug}/membership/{id}`
 *
 * A second list turned those two into `/@{slug}?action=…`, matching legacy's own `middleware.js`.
 * Both are now **real routes** (`app/(web)/(main)/(rail)/[slug]/direct-donation` and
 * `…/membership/[[...tier]]`), which is what buys a share card describing the offer and lets the
 * space page go back to static rendering — `channel-page.tsx`'s header has the reasoning.
 *
 * Do not put them back. Proxy runs **before** route resolution, so a redirect here would intercept
 * the request and those routes would never be reached; the only symptom is that the new pages
 * appear to do nothing, which is a long way from the cause. `proxy.test.ts` pins it.
 *
 * Two things fall out of the move. The old rule required a literal `@` — without it the pattern
 * matched *any* two-segment path, so `/foo/direct-donation` bounced to a bogus URL and 404'd, which
 * also made it a probe for arbitrary paths. And it only ever matched `@`, so `/%40ada/direct-donation`
 * missed; `[slug]` accepts both spellings, so that URL now works. `?action=` itself is unaffected and
 * still opens its dialog — see `parseChannelIntent`.
 *
 * Note there is deliberately **no** `/{slug}` → `/@{slug}` rule. Proxy runs before route resolution,
 * so a pattern like `/^\/([^/]+)$/` would swallow `/following`, `/search`, `/settings` and every
 * future single-segment static route before Next ever resolved them — a failure that only surfaces
 * the day someone ships one of those and finds it permanently unreachable.
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

/**
 * Legacy's **"add this space to your home screen"** URL, and the one rewrite in this file.
 *
 * `/@ada?startapp&addToHomeScreen` is an instruction screen, not the space: legacy replaces the
 * whole page with it (`[channelSlug]/index.js`'s `getLayout`, which returns `AddHomeScreenLayout`
 * when **both** markers are present) and gives it no chrome at all. This app cannot express that
 * from inside a page — a page cannot opt out of the layouts above it — so the request is rewritten
 * onto a route that sits outside them: `app/add-home-screen/[slug]`, which is outside `(web)` and
 * therefore mounts no session and no navigation, for the same reason `/app/*` does not.
 *
 * A **rewrite** and not a redirect, so the address stays the channel's. That URL is the contract:
 * it is what legacy's manifest pointed installs at, and any link already shared has to keep
 * working. It is also why the chrome matters — the mobile tab bar would otherwise sit exactly
 * where step 1 tells the reader to look ("in the bottom bar", meaning Safari's).
 *
 * Both markers are required, matching legacy's `'startapp' in query && 'addToHomeScreen' in
 * query`. `?startapp` alone is what an installed space launches with (see `channelStartUrl` in
 * `features/channel/lib/channel-manifest.ts`) and must render the space itself.
 */
const CHANNEL_ROOT_PATH = /^\/((?:@|%40)[^/]+)\/?$/

/**
 * Structurally typed rather than taking `NextURL`: that class only exists at
 * `next/dist/server/web/next-url`, and a deep import into Next's build output is a dependency on
 * a path they rename between minors. These two fields are all this needs.
 */
function addHomeScreenRewrite(url: {
    pathname: string
    searchParams: URLSearchParams
}): string | null {
    // The `@` may arrive percent-encoded — `parseChannelSlug` documents why `%40ada` is a URL a
    // person can legitimately hold — and the rewritten segment is handed to that same parser.
    const match = url.pathname.match(CHANNEL_ROOT_PATH)
    if (!match) return null
    // `has`, not a value: legacy's markers are bare (`?startapp&addToHomeScreen`), so the value is
    // the empty string and any test on it would fail.
    if (!url.searchParams.has('startapp') || !url.searchParams.has('addToHomeScreen')) return null
    return `/add-home-screen/${match[1]}`
}

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

/**
 * Both policies, on whatever response the request ends up with — a pass-through, a webview
 * pass-through or the one rewrite. Three call sites setting two headers by hand is three places
 * for the report-only header to go missing, which is invisible: the page renders either way and
 * only the Trusted Types reports stop arriving.
 */
function withPolicies<T extends NextResponse>(response: T, csp: string | null): T {
    if (csp) {
        response.headers.set(CSP_HEADER, csp)
        response.headers.set(CSP_REPORT_ONLY_HEADER, CSP_REPORT_ONLY)
    }
    return response
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

    for (const { from, to, when, keepSearch } of PATH_REDIRECTS) {
        if (!from.test(pathname)) continue
        if (when && !when(request.nextUrl.searchParams)) continue
        const url = request.nextUrl.clone()
        url.pathname = to(request.nextUrl.searchParams)
        if (!keepSearch) url.search = ''
        return NextResponse.redirect(url)
    }

    const rewrite = addHomeScreenRewrite(request.nextUrl)
    if (rewrite) {
        const url = request.nextUrl.clone()
        url.pathname = rewrite
        // The query rides along untouched: it is what got us here, and the screen is reached at
        // its own address too (`/add-home-screen/@ada`), where there is none.
        return withPolicies(NextResponse.rewrite(url, { request: { headers } }), csp)
    }

    return withPolicies(NextResponse.next({ request: { headers } }), csp)
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

    const response = withPolicies(NextResponse.next({ request: { headers } }), csp)
    const options = { path: '/', maxAge: WEBVIEW_COOKIE_MAX_AGE, sameSite: 'lax' } as const
    if (context.locale) response.cookies.set(LOCALE_COOKIE, context.locale, options)
    if (context.theme) response.cookies.set(WEBVIEW_THEME_COOKIE, context.theme, options)
    return response
}

export const config = {
    matcher: ['/((?!api|_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)'],
}
