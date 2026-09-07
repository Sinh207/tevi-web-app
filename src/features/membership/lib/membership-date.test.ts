import { describe, expect, it } from 'vitest'
import { formatMembershipDate, isMembershipEnding } from './membership-date'

describe('formatMembershipDate', () => {
    it('prints day, short month and year in the locale’s own order', () => {
        // Midday UTC, so the assertion does not depend on the runner's timezone.
        expect(formatMembershipDate('2026-09-01T12:00:00Z', 'en')).toMatch(/01/)
        expect(formatMembershipDate('2026-09-01T12:00:00Z', 'en')).toMatch(/2026/)
    })

    /** `''` is the row's signal to drop the whole line — see the file's note. */
    it('answers an empty string for anything unusable', () => {
        expect(formatMembershipDate(null)).toBe('')
        expect(formatMembershipDate(undefined)).toBe('')
        expect(formatMembershipDate('')).toBe('')
        expect(formatMembershipDate('not a date')).toBe('')
    })

    /** An unsupported tag must degrade to English, not throw inside a list row. */
    it('falls back to English for an invalid locale tag', () => {
        expect(formatMembershipDate('2026-09-01T12:00:00Z', 'not_a_locale')).toMatch(/2026/)
    })
})

describe('isMembershipEnding', () => {
    it('reads a cancelled-but-active membership as ending', () => {
        expect(isMembershipEnding({ canceled_at: '2026-01-01T00:00:00Z', status: 'active' })).toBe(
            true,
        )
    })

    it('reads an expired membership as ending even though nobody pressed cancel', () => {
        /*
         * The ordinary expired shape: a lapsed term or a failed renewal, `canceled_at: null`. Reading
         * only `canceled_at` printed its **past** `end_date` as "Next charge" — the reader was told
         * they were about to be billed for something that had already ended.
         */
        expect(isMembershipEnding({ canceled_at: null, status: 'expired' })).toBe(true)
    })

    it('leaves a renewing membership on its charge date', () => {
        expect(isMembershipEnding({ canceled_at: null, status: 'active' })).toBe(false)
        // An unknown status is not evidence of an ending — the payload's `status` is free text.
        expect(isMembershipEnding({ canceled_at: null, status: null })).toBe(false)
    })
})
