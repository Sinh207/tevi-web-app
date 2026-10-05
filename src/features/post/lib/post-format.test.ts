import { describe, expect, it } from 'vitest'
import { formatPostTimestamp } from './post-format'

/** Fixed instant, fixed offset — otherwise the assertion moves with the runner's timezone. */
const AT = new Date('2025-10-09T14:30:00Z').toISOString()

describe('formatPostTimestamp', () => {
    /**
     * Legacy's `MMM dd, yyyy - HH:mm`. The separator and the two-digit day are the parts that make
     * a diff against legacy readable, so they are asserted rather than the whole string.
     */
    it('renders an absolute stamp, not a relative one', () => {
        const out = formatPostTimestamp(AT, 'en-US')
        expect(out).toMatch(/^Oct 09, 2025 - \d{2}:\d{2}$/)
        expect(out).not.toMatch(/ago/)
    })

    /**
     * `HH:mm` is 24-hour, so `en` must not drift to `2:30 PM` the way a bare `timeStyle` would.
     */
    it('is 24-hour even in locales that default to 12', () => {
        expect(formatPostTimestamp(AT, 'en-US')).not.toMatch(/AM|PM/i)
    })

    it('formats the month in the reader\u2019s own locale', () => {
        expect(formatPostTimestamp(AT, 'vi')).toMatch(/2025/)
        expect(formatPostTimestamp(AT, 'ko')).toMatch(/2025/)
    })

    /** A stamp that cannot be parsed prints nothing rather than `Invalid Date`. */
    it('answers an empty string for an unparseable value', () => {
        expect(formatPostTimestamp('not-a-date', 'en')).toBe('')
    })
})
