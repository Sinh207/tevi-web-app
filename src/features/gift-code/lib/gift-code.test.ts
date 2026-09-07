import { ApiError } from '@shared/lib/api/errors'
import { describe, expect, it } from 'vitest'
import { canRedeem, isCodeRejection, normalizeCode, premiumDuration } from './gift-code'

describe('normalizeCode', () => {
    it('trims a pasted code', () => {
        expect(normalizeCode('  ABC-123  ')).toBe('ABC-123')
    })

    /**
     * The one transformation this must not make. Case-folding is invisible until a
     * case-sensitive code is rejected, and the rejection reads as "already used".
     */
    it('leaves case and internal characters alone', () => {
        expect(normalizeCode('aB c-1')).toBe('aB c-1')
    })
})

describe('canRedeem', () => {
    it('needs six characters after trimming', () => {
        expect(canRedeem('ABC12')).toBe(false)
        expect(canRedeem('ABC123')).toBe(true)
        // Whitespace is not length: '     A     ' is a one-character code.
        expect(canRedeem('     A     ')).toBe(false)
    })
})

describe('isCodeRejection', () => {
    it('treats an ordinary 4xx as the server saying no', () => {
        for (const status of [400, 404, 409, 422]) {
            expect(isCodeRejection(new ApiError({ message: 'no', status }))).toBe(true)
        }
    })

    /**
     * The four statuses inside 4xx that say nothing about the code — and the reason this
     * function exists rather than a `status < 500` check at the call site.
     */
    it('does not treat a session, permission or throttling failure as a bad code', () => {
        for (const status of [401, 403, 408, 429]) {
            expect(isCodeRejection(new ApiError({ message: 'no', status }))).toBe(false)
        }
    })

    it('does not treat an unknown outcome as a bad code', () => {
        expect(isCodeRejection(new ApiError({ message: 'boom', status: 502 }))).toBe(false)
        expect(isCodeRejection(new ApiError({ message: 'offline', isNetwork: true }))).toBe(false)
        expect(isCodeRejection(new Error('thrown by a queryFn'))).toBe(false)
    })
})

describe('premiumDuration', () => {
    const now = Date.parse('2026-08-19T00:00:00Z')
    const inDays = (days: number) => now + days * 86_400_000

    it('reads a month-scale grant in whole months', () => {
        expect(premiumDuration(inDays(30), now)).toEqual({ unit: 'month', count: 1 })
        expect(premiumDuration(inDays(90), now)).toEqual({ unit: 'month', count: 3 })
    })

    /** 365 days is a year, and a year is twelve months — not eleven. */
    it('reads a year as twelve months', () => {
        expect(premiumDuration(inDays(365), now)).toEqual({ unit: 'month', count: 12 })
    })

    it('reads a short grant in days, rounding a part-day up', () => {
        expect(premiumDuration(inDays(7), now)).toEqual({ unit: 'day', count: 7 })
        expect(premiumDuration(now + 9 * 3_600_000, now)).toEqual({ unit: 'day', count: 1 })
        expect(premiumDuration(inDays(29), now)).toEqual({ unit: 'day', count: 29 })
    })

    it('has nothing to say about a missing, unreadable or expired grant', () => {
        expect(premiumDuration(null, now)).toBeNull()
        expect(premiumDuration(undefined, now)).toBeNull()
        expect(premiumDuration(Number.NaN, now)).toBeNull()
        expect(premiumDuration(inDays(-1), now)).toBeNull()
    })
})
