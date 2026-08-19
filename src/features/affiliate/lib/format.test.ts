import { describe, expect, it } from 'vitest'
import { formatAffiliateMoney, formatCommissionRate } from './format'

describe('formatAffiliateMoney', () => {
    it('formats a figure in USD', () => {
        expect(formatAffiliateMoney(1500, 'en')).toBe('$1,500.00')
    })

    it('formats zero as money, not as a dash', () => {
        // Legacy's `revenue ? … : '--'` collapses "nothing earned" with "not known", so a brand-new
        // program advertises `--` where it means `$0.00`.
        expect(formatAffiliateMoney(0, 'en')).toBe('$0.00')
    })

    it('reports null for an absent figure, so the caller picks the placeholder', () => {
        expect(formatAffiliateMoney(null, 'en')).toBeNull()
    })
})

describe('formatCommissionRate', () => {
    it('keeps a whole number whole', () => {
        expect(formatCommissionRate(12)).toBe('12')
    })

    it('trims a trailing zero — the wire sends both 12 and 12.0', () => {
        expect(formatCommissionRate(12.0)).toBe('12')
        expect(formatCommissionRate(12.5)).toBe('12.5')
    })

    it('falls back to 0 rather than rendering an empty badge', () => {
        expect(formatCommissionRate(null)).toBe('0')
    })
})
