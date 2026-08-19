/**
 * The redirect half of OAuth, shared by the providers that have no popup SDK — TikTok
 * and LINE. Both send the browser away and get it back with `?code=&state=`, and both
 * were implemented twice in the legacy app with the same fifty lines.
 *
 * `state` is CSRF protection, and it only works if it is *checked*: the value is minted
 * here, kept in `sessionStorage` (per-tab, cleared with the tab — a redirect that lands
 * in a different tab should not be honoured), and the callback is ignored unless the
 * returned value matches. Without that, any page could hand us a `?code=` of its
 * choosing and have it exchanged for a session.
 */

/**
 * `sessionStorage` directly, not `shared/lib/storage`: that wrapper is for values meant
 * to persist, and this one must die with the tab that minted it.
 */
function readState(key: string): string | null {
    try {
        return sessionStorage.getItem(key)
    } catch {
        return null
    }
}

function writeState(key: string, value: string) {
    try {
        sessionStorage.setItem(key, value)
    } catch {
        // Private mode with storage disabled. The callback below will find no stored
        // state and refuse the exchange, which is the safe direction to fail in.
    }
}

function clearState(key: string) {
    try {
        sessionStorage.removeItem(key)
    } catch {
        // ignore
    }
}

function randomState(): string {
    const bytes = crypto.getRandomValues(new Uint8Array(16))
    return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')
}

export interface OAuthRedirectConfig {
    /** Provider name — also the `sessionStorage` namespace. */
    provider: string
    authorizeUrl: string
    /** Everything but `state` and `redirect_uri`, which this module owns. */
    params: Record<string, string>
    redirectUri: string
}

const stateKey = (provider: string) => `tevi.oauth.${provider}.state`

/** Send the browser to the provider. Never returns. */
export function beginOAuthRedirect({
    provider,
    authorizeUrl,
    params,
    redirectUri,
}: OAuthRedirectConfig) {
    const state = randomState()
    writeState(stateKey(provider), state)
    const query = new URLSearchParams({ ...params, redirect_uri: redirectUri, state })
    window.location.href = `${authorizeUrl}?${query.toString()}`
}

export interface OAuthCallback {
    code: string
    state: string
    redirect_uri: string
}

/**
 * Read a completed redirect out of the current URL, or `null` if this is not one.
 *
 * Consumes the stored state either way — a `state` that has been looked at once must
 * not be reusable, and leaving it behind means a later reload replays the exchange.
 * Returns `{ error }` separately so the caller can tell "the user declined" from
 * "this page load has nothing to do with OAuth".
 */
export function readOAuthCallback(
    provider: string,
    search: URLSearchParams,
    redirectUri: string,
): { callback?: OAuthCallback; error?: string } | null {
    const key = stateKey(provider)
    const expected = readState(key)
    // No state stored means this tab never started a redirect for this provider, so
    // whatever is on the URL did not come from us.
    if (!expected) return null

    clearState(key)

    const error = search.get('error')
    if (error) return { error }

    const code = search.get('code')
    const state = search.get('state')
    if (!code || !state || state !== expected) return null

    return { callback: { code, state, redirect_uri: redirectUri } }
}

/** Strip the OAuth params so a reload is not mistaken for a fresh callback. */
export function clearOAuthParamsFromUrl() {
    if (typeof window === 'undefined') return
    const url = new URL(window.location.href)
    for (const key of ['code', 'state', 'error', 'error_description', 'scopes']) {
        url.searchParams.delete(key)
    }
    window.history.replaceState(null, '', url.toString())
}
