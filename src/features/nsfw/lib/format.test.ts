import { describe, expect, it } from 'vitest'
import { formatDuration, formatFlaggedPostDate } from './format'

/**
 * Built in **local** time and handed over as an instant, so the assertions hold in whatever zone the
 * machine running them is in — the function renders in the reader's own zone by design, so a
 * hard-coded `Z` string would pass in CI and fail on a laptop in Asia.
 */
const LOCAL_5PM = new Date(2023, 1, 23, 17, 0, 0).toISOString()

describe('formatFlaggedPostDate', () => {
    it('joins the two halves with the comps’ spaced hyphen', () => {
        expect(formatFlaggedPostDate(LOCAL_5PM, 'en-GB')).toBe('23 Feb 2023 - 17:00')
    })

    it('keeps the locale’s own hour cycle rather than the mock’s', () => {
        // `en-US` is a 12-hour locale, so it must not be forced to 17:00.
        expect(formatFlaggedPostDate(LOCAL_5PM, 'en-US')).toMatch(/05:00 PM$/)
    })

    it('returns an empty string for anything unparseable, never Invalid Date', () => {
        expect(formatFlaggedPostDate(null)).toBe('')
        expect(formatFlaggedPostDate('')).toBe('')
        expect(formatFlaggedPostDate('not a date')).toBe('')
    })
})

describe('formatDuration', () => {
    it('pads the seconds and drops an absent hour', () => {
        expect(formatDuration(722)).toBe('12:02')
        expect(formatDuration(9)).toBe('0:09')
    })

    it('carries hours when there are any', () => {
        expect(formatDuration(3723)).toBe('1:02:03')
    })

    it('answers empty for a value that is not a duration', () => {
        expect(formatDuration(null)).toBe('')
        expect(formatDuration(-1)).toBe('')
        expect(formatDuration(Number.NaN)).toBe('')
    })
})
