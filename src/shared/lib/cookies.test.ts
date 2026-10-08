import { describe, expect, it } from 'vitest'
import { cookieDomainFor } from './cookies'

describe('cookieDomainFor', () => {
    it('widens a subdomain to the registrable domain', () => {
        expect(cookieDomainFor('app.tevi.dev')).toBe('.tevi.dev')
        expect(cookieDomainFor('tevi.com')).toBe('.tevi.com')
    })

    it('stays host-only where a domain attribute would be rejected', () => {
        expect(cookieDomainFor('localhost')).toBeUndefined()
        expect(cookieDomainFor('127.0.0.1')).toBeUndefined()
    })
})
