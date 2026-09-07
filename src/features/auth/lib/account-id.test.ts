// @vitest-environment jsdom
import { addOrUpdateAccount, clearTokens } from '@shared/lib/api/token'
import { beforeEach, describe, expect, it } from 'vitest'
import type { TokenResponse } from '../api/auth-api'
import { accountIdOf } from './account-id'

/**
 * A token identifying `value` **the way a Tevi token does** — the `uid` claim, not `sub`.
 *
 * This helper minted a `sub` for a while, which is why the suite below was green while the
 * fallback it pins never fired in production: no Tevi access token carries `sub` (`jwt.ts`).
 * Signature is irrelevant — never verified.
 */
function tokenFor(value: string | number): string {
    const b64 = (o: unknown) =>
        btoa(JSON.stringify(o)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
    return `${b64({ alg: 'HS256' })}.${b64({ uid: value, guid: 'g', token_type: 'access' })}.sig`
}

const res = (over: Partial<TokenResponse> = {}): TokenResponse => ({
    access_token: 'plain-not-a-jwt',
    refresh_token: 'rt',
    expires_in: 3600,
    ...over,
})

beforeEach(() => {
    localStorage.clear()
    clearTokens()
})

describe('accountIdOf', () => {
    it('prefers the user the response names', () => {
        expect(accountIdOf(res({ user: { id: 42 } }))).toBe('42')
        expect(accountIdOf(res({ user: { uid: 'firebase-uid' } }))).toBe('firebase-uid')
    })

    it("falls back to the token's own account claim", () => {
        expect(accountIdOf(res({ access_token: tokenFor('u-7') }))).toBe('u-7')
        expect(accountIdOf(res({ access_token: tokenFor(1234567) }))).toBe('1234567')
    })

    /**
     * **The regression.** The token endpoints answer no `user`, so the token claim is the *only*
     * thing between a sign-in and the fallback below — and while it read `sub`, it never fired.
     * A second sign-in therefore took the first account's id and overwrote its tokens, with
     * `canAddAccount` treating it as a re-login. Signing in as somebody else must never inherit
     * the account already on the device.
     */
    it('does not inherit the active account when the token identifies someone else', () => {
        addOrUpdateAccount({ id: 'anon-1', access_token: 'at', user: { id: 'anon-1' } })
        expect(accountIdOf(res({ access_token: tokenFor('u-7') }))).toBe('u-7')
    })

    it('inherits the active account only when the response says nothing', () => {
        addOrUpdateAccount({ id: 'current', access_token: 'at', user: { id: 'current' } })
        expect(accountIdOf(res())).toBe('current')
    })

    it('never collides two unidentifiable sign-ins onto one id', () => {
        // The last resort used to be the literal string 'me', so two responses that
        // carried no user overwrote each other's tokens.
        const a = accountIdOf(res())
        const b = accountIdOf(res())
        expect(a).not.toBe(b)
        expect(a.startsWith('unknown-')).toBe(true)
    })
})
