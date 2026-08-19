import { env } from '@shared/config/env'

/**
 * Which URLs this client is allowed to hand credentials to.
 *
 * `apiClient` is a single shared axios instance and models pass **absolute**
 * URLs, so a rule shaped like "attach the bearer unless the host looks like
 * storage" really means *every* absolute URL gets it — a pre-signed upload
 * endpoint, a third-party callback, a mistyped host. The same went for the
 * device id and the Turnstile token. Credentials go to the Tevi API and nowhere
 * else; anything else is an ordinary unauthenticated request.
 *
 * Matching is on the parsed **origin** (plus the base path, if the env var
 * carries one), never `startsWith`: `https://wapi.tevi.com` is a prefix of
 * `https://wapi.tevi.com.attacker.example/`, which is exactly the URL an
 * attacker would choose.
 */

function parse(url: string | undefined): URL | null {
    if (!url) return null
    try {
        return new URL(url)
    } catch {
        return null
    }
}

function matches(url: string, base: string | undefined): boolean {
    const target = parse(url)
    const root = parse(base)
    if (!target || !root) return false
    if (target.origin !== root.origin) return false
    const basePath = root.pathname.replace(/\/+$/, '')
    if (!basePath) return true
    return target.pathname === basePath || target.pathname.startsWith(`${basePath}/`)
}

/** True when the URL targets the Tevi W_API — the only credentialed, signed host. */
export function isApiUrl(url: string): boolean {
    return matches(url, env.NEXT_PUBLIC_W_API_DOMAIN)
}
