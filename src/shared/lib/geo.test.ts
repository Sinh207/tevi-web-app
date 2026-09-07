import { describe, expect, it } from 'vitest'
import { normalizeCountryCode, readCountryHeader } from './geo'

/**
 * Two rules, and both fail *silently* if they are wrong: a code that is not a country prefills the
 * payout billing form with a country nobody can be paid in, and a header read in the wrong order
 * prefills it with the CDN's guess where the ingress had the real answer.
 */
function headers(values: Record<string, string>) {
    return { get: (name: string) => values[name.toLowerCase()] ?? null }
}

describe('normalizeCountryCode', () => {
    it('upper-cases and trims a real code', () => {
        expect(normalizeCountryCode(' vn ')).toBe('VN')
        expect(normalizeCountryCode('us')).toBe('US')
    })

    it('rejects anything that is not two letters', () => {
        for (const value of ['', 'V', 'VNM', 'V1', '84', 'Việt', null, undefined, 42, {}]) {
            expect(normalizeCountryCode(value)).toBeNull()
        }
    })

    it('rejects the codes that mean “unknown”', () => {
        // Cloudflare sends `XX` when it cannot place the client and `T1` for Tor. Both are real
        // strings of two letters, so only an explicit list keeps them out of the form.
        expect(normalizeCountryCode('XX')).toBeNull()
        expect(normalizeCountryCode('t1')).toBeNull()
        expect(normalizeCountryCode('ZZ')).toBeNull()
    })
})

describe('readCountryHeader', () => {
    it('reads Cloudflare first, then the ingress, then Vercel', () => {
        expect(readCountryHeader(headers({ 'cf-ipcountry': 'VN' }))).toBe('VN')
        expect(readCountryHeader(headers({ 'x-country-code': 'ID' }))).toBe('ID')
        expect(readCountryHeader(headers({ 'x-vercel-ip-country': 'US' }))).toBe('US')
        expect(readCountryHeader(headers({ 'cf-ipcountry': 'VN', 'x-country-code': 'US' }))).toBe(
            'VN',
        )
    })

    it('falls through a header that says “unknown” to one that does not', () => {
        // Tor traffic through Cloudflare with an ingress that still knows the exit node's country:
        // stopping at the first *present* header would answer `T1`.
        expect(readCountryHeader(headers({ 'cf-ipcountry': 'T1', 'x-country-code': 'DE' }))).toBe(
            'DE',
        )
    })

    it('answers null when nothing said — the normal case in local dev', () => {
        expect(readCountryHeader(headers({}))).toBeNull()
        expect(readCountryHeader(headers({ 'cf-ipcountry': 'XX' }))).toBeNull()
    })
})
