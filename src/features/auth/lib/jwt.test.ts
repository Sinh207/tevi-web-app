import { describe, expect, it } from 'vitest'
import { jwtSubject } from './jwt'

/** Build an unsigned token whose payload is `claims` (base64url, as a JWT is). */
function token(claims: Record<string, unknown>): string {
    const payload = Buffer.from(JSON.stringify(claims))
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '')
    return `header.${payload}.signature`
}

describe('jwtSubject', () => {
    it('reads the sub claim', () => {
        expect(jwtSubject(token({ sub: 'user-42', exp: 123 }))).toBe('user-42')
    })

    it('accepts a numeric sub', () => {
        expect(jwtSubject(token({ sub: 42 }))).toBe('42')
    })

    it('survives base64url padding and non-ASCII claims', () => {
        expect(jwtSubject(token({ sub: 'Nguyễn', name: 'Đặng Sinh' }))).toBe('Nguyễn')
    })

    it('returns null rather than throwing on anything unusable', () => {
        expect(jwtSubject(null)).toBeNull()
        expect(jwtSubject(undefined)).toBeNull()
        expect(jwtSubject('')).toBeNull()
        expect(jwtSubject('not-a-jwt')).toBeNull()
        expect(jwtSubject('a.!!!not-base64!!!.c')).toBeNull()
        expect(jwtSubject(token({ exp: 1 }))).toBeNull() // no sub
        expect(jwtSubject('a.eyJzdWIiOjF9')).toBeNull() // truncated
    })
})
