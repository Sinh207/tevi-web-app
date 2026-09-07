import { describe, expect, it } from 'vitest'
import { jwtAccountId } from './jwt'

/** Build an unsigned token whose payload is `claims` (base64url, as a JWT is). */
function token(claims: Record<string, unknown>): string {
    const payload = Buffer.from(JSON.stringify(claims))
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '')
    return `header.${payload}.signature`
}

/**
 * The claims a real Tevi access token carries, per the auth contract. Every case below is built
 * from this rather than from an invented shape — the bug this file now guards against was a test
 * whose fixtures said `sub`, which no Tevi token has ever contained.
 */
const REAL = {
    guid: '3f1b0c9e-0000-4000-8000-000000000001',
    user_id: 'firebase-uid-abc',
    uid: 1234567,
    anonymous: false,
    is_suspended: false,
    token_type: 'access',
    jti: 'session-1',
    aud: 'tevi',
    iss: 'tevi-authenticator',
    exp: 1750000000,
}

describe('jwtAccountId', () => {
    /**
     * **The regression this file exists for.** `uid` is the numeric public alias and the same
     * value `/me` answers as `id`, so the account store, the ETag scope and the `/me` query key
     * all agree. Reading `sub` instead returned `null` for every real token, and `accountIdOf`
     * then fell through to "whichever account is active" — which on a second sign-in overwrites
     * the first account.
     */
    it('reads uid from a real Tevi token', () => {
        expect(jwtAccountId(token(REAL))).toBe('1234567')
    })

    it('never mistakes the Firebase uid for the account', () => {
        // `user_id` is a different identity space, and every anonymous session has one.
        const { uid: _uid, guid: _guid, ...noTeviId } = REAL
        expect(jwtAccountId(token(noTeviId))).toBeNull()
    })

    it('falls back to guid, then to sub', () => {
        const { uid: _uid, ...noUid } = REAL
        expect(jwtAccountId(token(noUid))).toBe(REAL.guid)
        expect(jwtAccountId(token({ sub: 'user-42', exp: 123 }))).toBe('user-42')
    })

    // `uid` is a number on the wire, and `/me`'s `id` is too — both are stringified so the store
    // is not keyed `1234567` in one place and `'1234567'` in another.
    it('stringifies a numeric claim', () => {
        expect(jwtAccountId(token({ uid: 42 }))).toBe('42')
        expect(jwtAccountId(token({ uid: 0 }))).toBe('0')
    })

    it('survives base64url padding and non-ASCII claims', () => {
        expect(jwtAccountId(token({ guid: 'Nguyễn', name: 'Đặng Sinh' }))).toBeTruthy()
        expect(jwtAccountId(token({ guid: 'Nguyễn' }))).toBe('Nguyễn')
    })

    it('returns null rather than throwing on anything unusable', () => {
        expect(jwtAccountId(null)).toBeNull()
        expect(jwtAccountId(undefined)).toBeNull()
        expect(jwtAccountId('')).toBeNull()
        expect(jwtAccountId('not-a-jwt')).toBeNull()
        expect(jwtAccountId('a.!!!not-base64!!!.c')).toBeNull()
        expect(jwtAccountId(token({ exp: 1 }))).toBeNull() // no identity claim at all
        expect(jwtAccountId('a.eyJ1aWQiOjF9')).toBeNull() // truncated
    })

    // A claim present but useless must not win over the next one in the list.
    it('skips an empty or non-finite claim', () => {
        expect(jwtAccountId(token({ uid: '', guid: 'g-1' }))).toBe('g-1')
        expect(jwtAccountId(token({ uid: null, guid: 'g-1' }))).toBe('g-1')
    })
})
