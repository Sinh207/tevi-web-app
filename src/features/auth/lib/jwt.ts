/**
 * Read a claim out of a JWT **without verifying it**.
 *
 * The signature is the backend's business — every token here came from the Tevi
 * API over TLS and is only ever handed back to it. This exists for one job: a
 * token response that carries no `user` object still has to be filed under a
 * stable account id, and the token itself asserts one.
 *
 * That is the **normal** case, not the edge one — `POST v1/token/`, `v1/connect/*` and
 * `user-login/login/` all answer `{ access_token, refresh_token, token_type, expires_in }`
 * and no `user` — so this is the whole of what stands between a sign-in and being filed
 * under whichever account happened to be active. The alternative was a hard-coded `'me'`,
 * under which two different accounts collided and overwrote each other in the store.
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

/**
 * The claims that identify an account, in the order they are trusted.
 *
 * ⚠ **A Tevi access token has no `sub`.** This module read one for a while and therefore
 * returned `null` for every real token — see `jwtAccountId` for what that cost. The claim set
 * is `{ guid, user_id, uid, anonymous, is_suspended, token_type, jti, aud, iss, exp }` (auth
 * contract), and two independent legacy call sites read **`uid`** out of it: `etagCache.js`
 * scopes its cache by `jwtDecode(token).uid`, and `zendesk-sso.js` uses it as the external id.
 *
 * - **`uid`** is first because it is the same value `/me` answers as `id` — the numeric public
 *   alias. Keying the account store on it is what makes `accountIdOf`'s other sources
 *   (`res.user.id`, an already-stored account) agree with it rather than forking one person
 *   into two entries.
 * - **`guid`** is the UUID user id, and is second for exactly that reason: stable and unique,
 *   but nothing else in this app is keyed on it, so a token missing `uid` would still file
 *   consistently while not matching `/me`.
 * - **`sub`** stays last and costs nothing. It is the JWT standard's own spelling, so if the
 *   backend ever adds it this keeps working instead of having to be found again.
 *
 * `user_id` is deliberately **not** here: it is the *Firebase* uid, a different identity space,
 * and every anonymous session has one. Keying on it would file a Firebase identity where the
 * rest of the app expects a Tevi account.
 */
const ID_CLAIMS = ['uid', 'guid', 'sub'] as const

/**
 * The account this token is for, as a string — or `null` if the token is missing or unreadable.
 *
 * **Was `jwtSubject`, and the rename is half the fix**: the name asserted a claim the token does
 * not carry, `jwt.test.ts` built its fixtures with that claim, and so a function that returned
 * `null` in production had a green test proving it worked. Named for what it answers now rather
 * than for where it reads it from, so the next spelling change is a line in `ID_CLAIMS` instead
 * of a lie in the name.
 */
export function jwtAccountId(token: string | null | undefined): string | null {
    if (!token) return null
    // header.payload.signature — anything else is not a token, whatever else it may
    // be, and guessing which part to read would be worse than declining.
    const segments = token.split('.')
    if (segments.length !== 3) return null
    const claims = decodeSegment(segments[1])
    if (!claims) return null
    for (const name of ID_CLAIMS) {
        const value = claims[name]
        if (typeof value === 'string' && value) return value
        // `uid` arrives as a **number** (`1234567`), which is also how `/me` sends `id`.
        if (typeof value === 'number' && Number.isFinite(value)) return String(value)
    }
    return null
}
