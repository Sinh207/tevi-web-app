import { env } from '@shared/config/env'

/**
 * HMAC-SHA256 request signing (client-side WebCrypto, ported from legacy app).
 * Signs `<pathname><unixTimestampSeconds>` and appends `?verify=<ts>-<base64mac>`
 * to requests hitting the W_API domain. The CryptoKey is imported once & cached.
 */

let cryptoKeyPromise: Promise<CryptoKey> | null = null

function getCryptoKey(): Promise<CryptoKey> {
    if (cryptoKeyPromise) return cryptoKeyPromise
    const secret = env.NEXT_PUBLIC_SIGN_SECRET
    cryptoKeyPromise = crypto.subtle.importKey(
        'raw',
        new TextEncoder().encode(secret),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign'],
    )
    return cryptoKeyPromise
}

/** Reset the cached key (e.g. after a secret rotation in tests). */
export function clearCryptoCache() {
    cryptoKeyPromise = null
}

function toBase64(bytes: ArrayBuffer): string {
    const arr = new Uint8Array(bytes)
    let binary = ''
    for (const b of arr) binary += String.fromCharCode(b)
    return btoa(binary)
}

/** Returns the `verify` query value for a given absolute URL, or null on failure. */
export async function signUrl(fullUrl: string): Promise<string | null> {
    try {
        if (typeof crypto === 'undefined' || !crypto.subtle) return null
        const { pathname } = new URL(fullUrl)
        const ts = Math.floor(Date.now() / 1000)
        const key = await getCryptoKey()
        const mac = await crypto.subtle.sign(
            'HMAC',
            key,
            new TextEncoder().encode(`${pathname}${ts}`),
        )
        return `${ts}-${toBase64(mac)}`
    } catch {
        // Signing failures must not block the request (matches legacy behavior).
        return null
    }
}

/** True when the URL targets the signed W_API domain. */
export function shouldSignRequest(fullUrl: string): boolean {
    const domain = env.NEXT_PUBLIC_W_API_DOMAIN
    return Boolean(domain) && fullUrl.startsWith(domain)
}
