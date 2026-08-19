// @vitest-environment jsdom
import { addOrUpdateAccount, clearTokens } from '@shared/lib/api/token'
import { beforeEach, describe, expect, it } from 'vitest'
import type { TokenResponse } from '../api/auth-api'
import { accountIdOf } from './account-id'

/** A token whose `sub` claim is `value`. Signature is irrelevant — never verified. */
function tokenFor(value: string): string {
    const b64 = (o: unknown) =>
        btoa(JSON.stringify(o)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
    return `${b64({ alg: 'HS256' })}.${b64({ sub: value })}.sig`
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

    it("falls back to the token's own subject", () => {
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
