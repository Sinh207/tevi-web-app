import { env } from '@shared/config/env'
import { isApiUrl } from '../origins'

/**
 * HMAC-SHA256 request signing (client-side WebCrypto, ported from legacy app).
 * Signs `<pathname><unixTimestampSeconds>` and appends `?verify=<ts>-<base64mac>`
 * to requests hitting the W_API domain. The CryptoKey is imported once & cached.
 *
 * ## What this does and does not prove
 *
 * **Signed:** the path, and roughly when the request was made.
 * **Not signed:** the method, the query string, the body, the host, the account.
 *
 * And the key is `NEXT_PUBLIC_SIGN_SECRET` — inlined into the client bundle by design
 * (`env.ts`), so anyone who can read the page can mint a valid `verify`. Taken together
 * this is a **bot speed bump, not an integrity control**: it raises the cost of casual
 * scraping and proves nothing about authenticity. Never treat a valid signature as
 * evidence a request was not tampered with; the CSP and the bearer are the real controls.
 *
 * Widening it (method + sorted query + body hash) is possible but is a coordinated
 * backend change — the server recomputes the MAC over exactly this string, so changing it
 * here alone 4xxs every signed request. **No v2 is planned** (B6, answered), so this string
 * is stable: treat it as the contract, and keep describing what it is worth accordingly.
 */

let cryptoKeyPromise: Promise<CryptoKey> | null = null

function getCryptoKey(): Promise<CryptoKey> {
    if (cryptoKeyPromise) return cryptoKeyPromise
    const secret = env.NEXT_PUBLIC_SIGN_SECRET
    cryptoKeyPromise = crypto.subtle
        .importKey(
            'raw',
            new TextEncoder().encode(secret),
            { name: 'HMAC', hash: 'SHA-256' },
            false,
            ['sign'],
        )
        // Cache the key, not a failure. Holding on to a rejected promise turns one
        // bad import — a transient WebCrypto hiccup, an env that had not parsed yet —
        // into every request going unsigned for the rest of the page's life.
        .catch(error => {
            cryptoKeyPromise = null
            throw error
        })
    return cryptoKeyPromise
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

/** True when the URL targets the signed W_API domain (origin match, not prefix). */
export function shouldSignRequest(fullUrl: string): boolean {
    return isApiUrl(fullUrl)
}
