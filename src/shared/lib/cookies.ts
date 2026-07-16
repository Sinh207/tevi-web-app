import Cookies from 'js-cookie'

/**
 * Cross-subdomain cookie helpers.
 *
 * Tokens are shared across *.tevi.* properties for SSO, so cookies are written
 * with `domain=.<registrable-domain>` and `SameSite=None; Secure` (matching the
 * legacy app's contract). On localhost we omit the domain.
 */

/** `.tevi.dev` from `app.tevi.dev`; null on localhost / IP. */
export function getCookieDomain(): string | undefined {
    if (typeof window === 'undefined') return undefined
    const host = window.location.hostname
    if (host === 'localhost' || /^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return undefined
    const parts = host.split('.')
    if (parts.length < 2) return undefined
    return `.${parts.slice(-2).join('.')}`
}

const baseAttrs = (): Cookies.CookieAttributes => {
    const domain = getCookieDomain()
    const secure = typeof window !== 'undefined' && window.location.protocol === 'https:'
    return {
        domain,
        expires: 1, // 1 day (matches legacy)
        path: '/',
        sameSite: secure ? 'None' : 'Lax',
        secure,
    }
}

export function getCookie(name: string): string | undefined {
    return Cookies.get(name)
}

export function setCookie(name: string, value: string, attrs?: Cookies.CookieAttributes) {
    Cookies.set(name, value, { ...baseAttrs(), ...attrs })
}

export function removeCookie(name: string) {
    const { domain, path } = baseAttrs()
    Cookies.remove(name, { domain, path })
    // Also attempt host-only removal as a fallback.
    Cookies.remove(name, { path })
}
