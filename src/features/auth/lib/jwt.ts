/**
 * Read a claim out of a JWT **without verifying it**.
 *
 * The signature is the backend's business — every token here came from the Tevi
 * API over TLS and is only ever handed back to it. This exists for one job: a
 * token response that carries no `user` object still has to be filed under a
 * stable account id, and the `sub` claim is the identity the token itself
 * asserts. The alternative was a hard-coded `'me'`, under which two different
 * accounts collided and overwrote each other in the store.
 *
 * Never use this to decide what someone is allowed to do. An unverified JWT is
 * an unauthenticated string that happens to be shaped like a claim.
 */
function decodeSegment(segment: string): Record<string, unknown> | null {
    try {
        // base64url → base64, then pad to a multiple of 4.
        const base64 = segment.replace(/-/g, '+').replace(/_/g, '/')
        const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=')
        // Decode to *bytes* and then as UTF-8. Treating `atob`'s output as text
        // reads every multi-byte character as Latin-1 — a display name in
        // Vietnamese or Korean comes back mangled, and any claim carrying one is
        // then quietly wrong rather than obviously broken.
        const bytes =
            typeof atob === 'function'
                ? Uint8Array.from(atob(padded), c => c.charCodeAt(0))
                : new Uint8Array(Buffer.from(padded, 'base64'))
        const parsed: unknown = JSON.parse(new TextDecoder().decode(bytes))
        return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null
    } catch {
        return null
    }
}

/** The `sub` claim as a string, or null if the token is missing/unreadable. */
export function jwtSubject(token: string | null | undefined): string | null {
    if (!token) return null
    // header.payload.signature — anything else is not a token, whatever else it may
    // be, and guessing which part to read would be worse than declining.
    const segments = token.split('.')
    if (segments.length !== 3) return null
    const claims = decodeSegment(segments[1])
    const sub = claims?.sub
    if (typeof sub === 'string' && sub) return sub
    if (typeof sub === 'number') return String(sub)
    return null
}
