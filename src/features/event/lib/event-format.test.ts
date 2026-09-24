import { describe, expect, it } from 'vitest'
import { formatEventDate, formatEventDateTime, formatEventTime } from './event-format'

/**
 * ⚠ These assert **local** time, which is deliberate and is why they set `TZ`-independent
 * expectations only where the value cannot move: a livestream's start is an appointment, so the zone
 * is the reader's (see the module's own note, and `EventSchedule` for the hydration consequence).
 * The one thing pinned here is the *shape*.
 */
describe('formatEventDate', () => {
    it('formats a day, a short month and a year', () => {
        // The order is the locale's — `20 thg 2, 2026` in Vietnamese — so only the parts are asserted.
        const out = formatEventDate('2026-02-20T14:30:00Z', 'en-US')
        expect(out).toMatch(/2026/)
        expect(out).toMatch(/Feb/)
    })

    /** `''` and never `'Invalid Date'` — those two words render straight into the page. */
    it('is empty for nothing usable, so the caller can drop the row', () => {
        expect(formatEventDate(null)).toBe('')
        expect(formatEventDate(undefined)).toBe('')
        expect(formatEventDate('soon')).toBe('')
        expect(formatEventDate('')).toBe('')
    })

    /** An unrecognised locale tag must not take the page down. */
    it('falls back to English rather than throwing', () => {
        expect(formatEventDate('2026-02-20T14:30:00Z', 'not-a-locale')).toMatch(/2026/)
    })
})

describe('formatEventTime', () => {
    /** Pinned to 24-hour in all nine locales, which is what legacy's `HH:mm` does. */
    it('is 24-hour, zero-padded', () => {
        expect(formatEventTime('2026-02-20T14:30:00Z', 'en-US')).toMatch(/^\d{2}:\d{2}$/)
        expect(formatEventTime('2026-02-20T14:30:00Z', 'en-US')).not.toMatch(/[AP]M/i)
    })

    it('is empty for nothing usable', () => {
        expect(formatEventTime(null)).toBe('')
        expect(formatEventTime('soon')).toBe('')
    })
})

describe('formatEventDateTime', () => {
    it('carries both halves in one string, for a place with no room for two', () => {
        const out = formatEventDateTime('2026-02-20T14:30:00Z', 'en-US')
        expect(out).toMatch(/2026/)
        expect(out).toMatch(/\d{2}:\d{2}/)
    })

    it('is empty for nothing usable, so a sentence does not open with a comma', () => {
        expect(formatEventDateTime(null)).toBe('')
    })
})
