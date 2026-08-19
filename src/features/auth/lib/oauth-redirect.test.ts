// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { beginOAuthRedirect, clearOAuthParamsFromUrl, readOAuthCallback } from './oauth-redirect'

/**
 * `state` is the only thing standing between this flow and anyone handing us an
 * authorization code of their choosing to exchange for a session. These pin that it is
 * actually checked, and that it is single-use.
 */

const REDIRECT = 'https://tevi.dev/login'

/** `beginOAuthRedirect` assigns `location.href`, which jsdom refuses to navigate. */
function startFlow(provider: string) {
    const original = window.location
    Object.defineProperty(window, 'location', {
        configurable: true,
        value: { ...original, href: '' },
    })
    beginOAuthRedirect({
        provider,
        authorizeUrl: 'https://provider.example/auth',
        params: { client_id: 'abc', response_type: 'code' },
        redirectUri: REDIRECT,
    })
    const sent = new URL(window.location.href)
    Object.defineProperty(window, 'location', { configurable: true, value: original })
    return sent
}

beforeEach(() => {
    sessionStorage.clear()
})

describe('beginOAuthRedirect', () => {
    it('sends the caller params plus a state it stored', () => {
        const url = startFlow('tiktok')

        expect(url.origin + url.pathname).toBe('https://provider.example/auth')
        expect(url.searchParams.get('client_id')).toBe('abc')
        expect(url.searchParams.get('redirect_uri')).toBe(REDIRECT)
        const state = url.searchParams.get('state')
        expect(state).toBeTruthy()
        expect(sessionStorage.getItem('tevi.oauth.tiktok.state')).toBe(state)
    })

    it('never reuses a state', () => {
        const a = startFlow('tiktok').searchParams.get('state')
        const b = startFlow('tiktok').searchParams.get('state')
        expect(a).not.toBe(b)
    })
})

describe('readOAuthCallback', () => {
    it('accepts a callback whose state matches the one this tab stored', () => {
        const state = startFlow('line').searchParams.get('state') ?? ''

        const result = readOAuthCallback(
            'line',
            new URLSearchParams({ code: 'c1', state }),
            REDIRECT,
        )

        expect(result?.callback).toEqual({ code: 'c1', state, redirect_uri: REDIRECT })
    })

    it('refuses a code whose state does not match', () => {
        startFlow('line')

        const result = readOAuthCallback(
            'line',
            new URLSearchParams({ code: 'attacker', state: 'not-ours' }),
            REDIRECT,
        )

        expect(result?.callback).toBeUndefined()
    })

    it('ignores a URL entirely when this tab never started a flow', () => {
        // Someone linked to `/login?code=…`. Nothing stored, so nothing to exchange.
        const result = readOAuthCallback(
            'tiktok',
            new URLSearchParams({ code: 'attacker', state: 'anything' }),
            REDIRECT,
        )

        expect(result).toBeNull()
    })

    it('consumes the state, so a reload cannot replay the exchange', () => {
        const state = startFlow('tiktok').searchParams.get('state') ?? ''
        const params = new URLSearchParams({ code: 'c1', state })

        expect(readOAuthCallback('tiktok', params, REDIRECT)?.callback).toBeDefined()
        expect(readOAuthCallback('tiktok', params, REDIRECT)).toBeNull()
    })

    it('reports a provider-side error separately from "not a callback"', () => {
        startFlow('line')

        const result = readOAuthCallback(
            'line',
            new URLSearchParams({ error: 'access_denied' }),
            REDIRECT,
        )

        expect(result?.error).toBe('access_denied')
        expect(result?.callback).toBeUndefined()
    })

    it('keeps providers separate — one flow cannot answer for another', () => {
        const state = startFlow('tiktok').searchParams.get('state') ?? ''

        expect(
            readOAuthCallback('line', new URLSearchParams({ code: 'c', state }), REDIRECT),
        ).toBeNull()
    })
})

describe('clearOAuthParamsFromUrl', () => {
    it('strips the OAuth params and leaves the rest of the URL alone', () => {
        window.history.replaceState(null, '', '/login?code=c1&state=s1&error=x&keep=yes')

        clearOAuthParamsFromUrl()

        const url = new URL(window.location.href)
        expect(url.searchParams.get('code')).toBeNull()
        expect(url.searchParams.get('state')).toBeNull()
        expect(url.searchParams.get('error')).toBeNull()
        expect(url.searchParams.get('keep')).toBe('yes')
    })
})
