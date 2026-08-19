import { describe, expect, it } from 'vitest'
import { shouldSignRequest, signUrl } from './sign'

describe('shouldSignRequest', () => {
    it('signs W_API URLs only', () => {
        expect(shouldSignRequest('https://wapi.tevi.dev/core/v1/feed/')).toBe(true)
        expect(shouldSignRequest('https://storage.googleapis.com/x')).toBe(false)
        expect(shouldSignRequest('https://other.com/x')).toBe(false)
    })

    it('matches the origin, not a string prefix', () => {
        expect(shouldSignRequest('https://wapi.tevi.dev.attacker.example/x')).toBe(false)
    })
})

describe('signUrl', () => {
    it('returns a `<unixSeconds>-<base64mac>` token', async () => {
        const verify = await signUrl('https://wapi.tevi.dev/auth/v1/me/')
        expect(verify).toMatch(/^\d{10}-[A-Za-z0-9+/=]+$/)
    })

    it('signature depends on the pathname', async () => {
        // Same-second calls to different paths should differ in the MAC part.
        const [a, b] = await Promise.all([
            signUrl('https://wapi.tevi.dev/auth/v1/me/'),
            signUrl('https://wapi.tevi.dev/core/v1/feed/'),
        ])
        const macA = a?.split('-')[1]
        const macB = b?.split('-')[1]
        expect(macA).toBeTruthy()
        expect(macA).not.toBe(macB)
    })
})
