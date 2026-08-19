import { describe, expect, it } from 'vitest'
import { isApiUrl } from './origins'

// vitest.config.ts pins NEXT_PUBLIC_W_API_DOMAIN to https://wapi.tevi.dev
describe('isApiUrl', () => {
    it('accepts the API origin', () => {
        expect(isApiUrl('https://wapi.tevi.dev/auth/v1/me/')).toBe(true)
        expect(isApiUrl('https://wapi.tevi.dev')).toBe(true)
    })

    it('rejects a host that merely starts with the API domain', () => {
        // The whole point: `startsWith` handed the bearer to this one.
        expect(isApiUrl('https://wapi.tevi.dev.attacker.example/steal')).toBe(false)
        expect(isApiUrl('https://wapi.tevi.dev.evil.io')).toBe(false)
    })

    it('rejects other hosts, other schemes and unparseable URLs', () => {
        expect(isApiUrl('https://storage.googleapis.com/bucket/x')).toBe(false)
        expect(isApiUrl('https://tevi.dev/auth/v1/me/')).toBe(false)
        expect(isApiUrl('http://wapi.tevi.dev/auth/v1/me/')).toBe(false)
        expect(isApiUrl('/auth/v1/me/')).toBe(false)
        expect(isApiUrl('')).toBe(false)
    })
})
