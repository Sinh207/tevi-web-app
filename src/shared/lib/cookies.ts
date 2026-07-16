/**
 * Cookie helpers. Auth tokens are NOT stored in cookies (localStorage-only —
 * see api/token.ts); this is used for the i18n locale cookie, which is written
 * cross-subdomain so the server layout can read it for the initial <html lang>.
 */

/** `.tevi.dev` from `app.tevi.dev`; undefined on localhost / IP. */
export function getCookieDomain(): string | undefined {
    if (typeof window === 'undefined') return undefined
    const host = window.location.hostname
    if (host === 'localhost' || /^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return undefined
    const parts = host.split('.')
    if (parts.length < 2) return undefined
    return `.${parts.slice(-2).join('.')}`
}
