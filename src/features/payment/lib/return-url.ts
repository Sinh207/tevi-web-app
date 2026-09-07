import { env } from '@shared/config/env'
import { stripCallbackParams } from './checkout-callback'

/**
 * Where a gateway sends the browser back to.
 *
 * ## Why this is not `window.location.href`
 *
 * Legacy builds every return URL as `${window.location.origin}${window.location.pathname}`. Three
 * problems, and this file exists for all three:
 *
 * 1. **It is sent to a third party.** The URL goes into a checkout body and comes back as a
 *    navigation, so anything that reaches it can navigate a returning reader anywhere. Built from
 *    `env.NEXT_PUBLIC_BASE_URL` plus a path this app produced, it cannot leave our origin —
 *    a caller passing `https://evil.example/x` or `//evil.example` gets our own base and the path
 *    discarded.
 * 2. **Callback parameters nest.** Return from a 3DS hop with `?payment_intent_client_secret=…`
 *    still on the URL, start a second payment, and the new return URL carries the old payment's
 *    secret. `stripCallbackParams` takes them off.
 * 3. **The origin must match the app's own**, not the browser's. In a webview the page can be loaded
 *    from a host we do not control the canonical form of; the configured base URL is the one Stripe
 *    is allowed to return to.
 */

/** Only a same-origin, absolute-from-root path survives. Anything else becomes `/`. */
function safePath(pathname: string): string {
    if (!pathname.startsWith('/') || pathname.startsWith('//')) return '/'
    // A backslash is a path separator to some parsers and not others — `/\evil.example` has been an
    // open-redirect in more than one framework. Not a path this app produces, so it is not accepted.
    if (pathname.includes('\\')) return '/'
    return pathname
}

/**
 * An absolute return URL on this app's own origin.
 *
 * `search` is optional and is **filtered**: the screen's own parameters (a tab, a gift token) are
 * kept so the reader comes back to what they were looking at, and every callback parameter is
 * dropped.
 */
export function checkoutReturnUrl(pathname: string, search?: string): string {
    const base = env.NEXT_PUBLIC_BASE_URL.replace(/\/+$/, '')
    const query = search ? stripCallbackParams(search) : ''
    return `${base}${safePath(pathname)}${query ? `?${query}` : ''}`
}

/**
 * The pair every checkout body carries.
 *
 * Success and failure are the **same URL** — as in legacy — because the outcome is not read off the
 * URL: it is read off `payment/v3/stripe/callback/` (or `redirect-callback/`). Two different paths
 * would mean two places that decide what happened, and the URL is the one that cannot be trusted.
 */
export function checkoutReturnUrls(pathname: string, search?: string) {
    const url = checkoutReturnUrl(pathname, search)
    return { successUrl: url, failUrl: url }
}
