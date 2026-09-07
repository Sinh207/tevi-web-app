import { describe, expect, it } from 'vitest'
import { formatInboxTime } from './inbox-time'

/**
 * The timestamp, pinned — and `now` is a parameter precisely so this can be stated without
 * freezing the clock. Two things here are behaviour rather than formatting, and both are what the
 * tests are for: the seven-day cut-off (past which the phrase gets *vaguer* the more precision the
 * reader wants) and the rounding direction (a notification must never claim to be older than it is,
 * or two rows read in the wrong order).
 *
 * Phrases are asserted loosely — `toContain`, or a shape — because the exact wording is `Intl`'s and
 * belongs to the ICU data, not to this app. Pinning "2 hours ago" verbatim would make a Node upgrade
 * a failing test for a string nobody chose.
 */
const NOW = Date.parse('2026-08-24T12:00:00.000Z')
const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

function at(offsetMs: number): string {
    return new Date(NOW - offsetMs).toISOString()
}

describe('formatInboxTime', () => {
    it('returns an empty string when there is no usable timestamp', () => {
        expect(formatInboxTime(null, 'en', NOW)).toBe('')
        expect(formatInboxTime(undefined, 'en', NOW)).toBe('')
        expect(formatInboxTime('', 'en', NOW)).toBe('')
        expect(formatInboxTime('not a date', 'en', NOW)).toBe('')
    })

    it('says "now" under a minute', () => {
        expect(formatInboxTime(at(30 * 1000), 'en', NOW)).toBe(
            new Intl.RelativeTimeFormat('en', { numeric: 'auto', style: 'short' }).format(
                0,
                'minute',
            ),
        )
    })

    it('counts minutes, then hours, then days', () => {
        expect(formatInboxTime(at(5 * MINUTE), 'en', NOW)).toContain('5')
        expect(formatInboxTime(at(3 * HOUR), 'en', NOW)).toContain('3')
        expect(formatInboxTime(at(2 * DAY), 'en', NOW)).toContain('2')
    })

    /**
     * Rounded **down** at every step. 119 minutes is "1 hour ago", not "2 hours ago": a row that
     * overstates its age puts two notifications in the wrong order for a reader comparing them.
     */
    it('rounds down rather than to nearest', () => {
        expect(formatInboxTime(at(119 * MINUTE), 'en', NOW)).toContain('1')
        expect(formatInboxTime(at(119 * MINUTE), 'en', NOW)).not.toContain('2')
    })

    /** `numeric: 'auto'` is what turns `-1 day` into a word where the locale has one. */
    it('uses the locale word for one day ago', () => {
        expect(formatInboxTime(at(DAY + HOUR), 'en', NOW).toLowerCase()).toContain('yesterday')
    })

    /**
     * The cut-off, and the behaviour legacy is missing: its `fDistance` keeps counting, so a
     * two-month-old notification says "about 2 months ago".
     */
    it('switches to an absolute short date at seven days', () => {
        const inside = formatInboxTime(at(6 * DAY), 'en', NOW)
        const outside = formatInboxTime(at(8 * DAY), 'en', NOW)
        expect(inside).toContain('6')
        // A month name is present, and no "ago".
        expect(outside).toMatch(/[A-Za-z]{3}/)
        expect(outside).not.toContain('ago')
    })

    /** The year is printed only when it is not the current one — the line is competing for width
     *  beside a title on a phone, and every old row would otherwise repeat the same four digits. */
    it('adds the year only for a date in another year', () => {
        expect(formatInboxTime(at(30 * DAY), 'en', NOW)).not.toContain('2026')
        expect(formatInboxTime('2024-02-20T10:00:00.000Z', 'en', NOW)).toContain('2024')
    })

    /**
     * A device clock behind the server's produces a `created_at` in the future. A notification
     * cannot be delivered before it exists, so **any** future stamp reads as "now" rather than
     * being counted forwards — "in 3 hours" on something already in the inbox reads as a bug in
     * the app rather than as a wrong clock.
     *
     * This is here because the first version of it did not work: the implementation guarded only
     * the first minute of skew and let everything beyond it fall through to a `< MINUTE`
     * comparison that a negative number satisfies anyway. The stated rule and the behaviour
     * disagreed, and nothing but a test at two hours would have said so.
     */
    it.each([30 * 1000, 2 * HOUR, 30 * DAY])('reads a stamp %ims in the future as "now"', ahead => {
        const nowPhrase = new Intl.RelativeTimeFormat('en', {
            numeric: 'auto',
            style: 'short',
        }).format(0, 'minute')
        expect(formatInboxTime(at(-ahead), 'en', NOW)).toBe(nowPhrase)
    })

    it('localises, and falls back to English on a tag Intl cannot parse', () => {
        expect(formatInboxTime(at(2 * HOUR), 'vi', NOW)).not.toBe(
            formatInboxTime(at(2 * HOUR), 'en', NOW),
        )
        expect(() => formatInboxTime(at(2 * HOUR), 'not-a-locale!!', NOW)).not.toThrow()
        expect(formatInboxTime(at(2 * HOUR), 'not-a-locale!!', NOW)).toBe(
            formatInboxTime(at(2 * HOUR), 'en', NOW),
        )
    })
})
