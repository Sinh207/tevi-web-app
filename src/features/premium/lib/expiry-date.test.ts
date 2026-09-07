import { describe, expect, it } from 'vitest'
import { formatExpiryDate } from './expiry-date'

describe('formatExpiryDate', () => {
    /** Epoch ms, formatted as a day. `Date.UTC` so the case does not depend on the host zone. */
    it('prints the day, the month and the year', () => {
        expect(formatExpiryDate(Date.UTC(2026, 1, 19, 12), 'en')).toBe('Feb 19, 2026')
    })

    it('follows the reader’s locale order', () => {
        expect(formatExpiryDate(Date.UTC(2026, 1, 19, 12), 'ko')).toContain('2026')
    })

    /**
     * A structurally invalid tag raises a `RangeError` from `Intl`, and this formatter sits on a
     * screen whose whole subject is a subscription — so it falls back rather than taking the page
     * with it. (`'not-a-locale'` would *not* have shown this: it is a well-formed tag `Intl`
     * accepts and resolves to the default, which is the trap in writing this test.)
     */
    it('falls back to English rather than throwing on a bad locale', () => {
        expect(formatExpiryDate(Date.UTC(2026, 1, 19, 12), '!')).toBe('Feb 19, 2026')
    })

    /** `''` lets the caller drop the line instead of printing `Invalid Date`. */
    it.each([null, undefined, Number.NaN, Number.POSITIVE_INFINITY])('is empty for %s', value => {
        expect(formatExpiryDate(value as number | null | undefined)).toBe('')
    })
})
