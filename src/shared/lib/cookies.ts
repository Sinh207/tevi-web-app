/**
 * Cookie helpers. Auth tokens are NOT stored in cookies (localStorage-only —
 * see api/token.ts); this is used for the i18n locale cookie, which is written
 * cross-subdomain so the server layout can read it for the initial <html lang>.
 */

/**
 * `.tevi.dev` from `app.tevi.dev`; undefined on localhost / IP.
 *
 * Pure, so **both writers of the locale cookie use it** — the language switcher in the browser and
 * `proxy.ts` on a `?lang=` or webview request. A cookie's identity is name *and* domain: written
 * host-only by one and on `.tevi.dev` by the other, the browser keeps two `tevi.locale` cookies,
 * sends both, and which one the server reads is the browser's choice — so a switch could appear
 * not to stick.
 */
export function cookieDomainFor(host: string): string | undefined {
    if (host === 'localhost' || /^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return undefined
    const parts = host.split('.')
    if (parts.length < 2) return undefined
    return `.${parts.slice(-2).join('.')}`
}

/** `cookieDomainFor` the current page's host; undefined on the server. */
export function getCookieDomain(): string | undefined {
    if (typeof window === 'undefined') return undefined
    return cookieDomainFor(window.location.hostname)
}
