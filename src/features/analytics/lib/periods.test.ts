import { describe, expect, it } from 'vitest'
import {
    comparisonRange,
    customRange,
    endOfDay,
    formatGmtOffset,
    hourIntervalFor,
    parseRangeParams,
    rangeDayCount,
    resolvePeriodRange,
    startOfDay,
} from './periods'

/**
 * The day arithmetic behind every request this screen makes.
 *
 * Worth a test rather than a read-through because the failures are *plausible*: an off-by-one in the
 * inclusive day count produces a range that is one day short, which looks like a slow week rather
 * than like a bug. Legacy has exactly that in its comparison caption, computed from a different
 * expression than the one it labels the range with.
 *
 * `now` is passed in everywhere, so every case below is a fixed instant.
 */

/** 19 Feb 2025, 13:45 local. Mid-afternoon on purpose: a midnight `now` would hide boundary slips. */
const NOW = new Date(2025, 1, 19, 13, 45, 30, 250)

describe('resolvePeriodRange', () => {
    it('makes yesterday the whole of yesterday, not the last 24 hours', () => {
        const range = resolvePeriodRange('yesterday', NOW)
        expect(range).not.toBeNull()
        expect(new Date(range?.startMs ?? 0)).toEqual(new Date(2025, 1, 18, 0, 0, 0, 0))
        expect(new Date(range?.endMs ?? 0)).toEqual(new Date(2025, 1, 18, 23, 59, 59, 999))
        expect(rangeDayCount(range as { startMs: number; endMs: number })).toBe(1)
    })

    it('counts today as one of the days', () => {
        // 7 days ending tonight is the 13th to the 19th — not the 12th to the 19th, which is 8.
        const range = resolvePeriodRange('7d', NOW)
        expect(new Date(range?.startMs ?? 0)).toEqual(new Date(2025, 1, 13, 0, 0, 0, 0))
        expect(new Date(range?.endMs ?? 0)).toEqual(new Date(2025, 1, 19, 23, 59, 59, 999))
        expect(rangeDayCount(range as { startMs: number; endMs: number })).toBe(7)
    })

    it('crosses a month boundary without arithmetic on milliseconds', () => {
        const range = resolvePeriodRange('30d', NOW)
        expect(new Date(range?.startMs ?? 0)).toEqual(new Date(2025, 0, 21, 0, 0, 0, 0))
        expect(rangeDayCount(range as { startMs: number; endMs: number })).toBe(30)
    })

    it('has no range of its own for custom', () => {
        expect(resolvePeriodRange('custom', NOW)).toBeNull()
    })
})

describe('hourIntervalFor', () => {
    const range = (days: number) => resolvePeriodRange(days === 1 ? 'yesterday' : '7d', NOW)

    it('buckets a single day hourly', () => {
        expect(hourIntervalFor(range(1) as { startMs: number; endMs: number })).toBe(1)
    })

    it('buckets a week daily', () => {
        expect(hourIntervalFor(range(7) as { startMs: number; endMs: number })).toBe(24)
    })

    it('switches from daily to weekly at the `spanDays > 30` boundary, either side of it', () => {
        /*
         * The old version of this test asserted an **81-day** range for the "31-day" half
         * (1 Dec → 19 Feb), so the `<= 30` threshold was pinned in neither direction — changing it
         * would have failed nothing. `spanDays` counts whole days *between* the ends (legacy's
         * exclusive `differenceInDays`), so the boundary is:
         *
         *   20 Jan → 19 Feb = 30 → daily
         *   19 Jan → 19 Feb = 31 → weekly
         */
        expect(hourIntervalFor(customRange(new Date(2025, 0, 20), new Date(2025, 1, 19)))).toBe(24)
        expect(hourIntervalFor(customRange(new Date(2025, 0, 19), new Date(2025, 1, 19)))).toBe(168)
    })
})

describe('comparisonRange', () => {
    it('is the same length, ending the day before the range starts', () => {
        const range = resolvePeriodRange('7d', NOW) as { startMs: number; endMs: number }
        const previous = comparisonRange(range)
        expect(new Date(previous.endMs)).toEqual(new Date(2025, 1, 12, 23, 59, 59, 999))
        expect(new Date(previous.startMs)).toEqual(new Date(2025, 1, 6, 0, 0, 0, 0))
        expect(rangeDayCount(previous)).toBe(rangeDayCount(range))
    })

    it('is the day before yesterday for the yesterday period', () => {
        // Legacy's version is a day out here: it takes the count from an expression that excludes
        // the end day, so a 1-day range compares against a 0-day window.
        const previous = comparisonRange(
            resolvePeriodRange('yesterday', NOW) as { startMs: number; endMs: number },
        )
        expect(rangeDayCount(previous)).toBe(1)
        expect(new Date(previous.startMs)).toEqual(new Date(2025, 1, 17, 0, 0, 0, 0))
    })
})

describe('customRange', () => {
    it('snaps to whole local days', () => {
        const range = customRange(new Date(2025, 1, 10, 9, 30), new Date(2025, 1, 12, 17, 15))
        expect(new Date(range.startMs)).toEqual(startOfDay(new Date(2025, 1, 10)))
        expect(new Date(range.endMs)).toEqual(endOfDay(new Date(2025, 1, 12)))
    })

    it('orders the two ends', () => {
        const forwards = customRange(new Date(2025, 1, 10), new Date(2025, 1, 12))
        const backwards = customRange(new Date(2025, 1, 12), new Date(2025, 1, 10))
        expect(backwards).toEqual(forwards)
    })
})

describe('formatGmtOffset', () => {
    it('prints whole-hour zones with a sign', () => {
        // The argument is minutes *west* of UTC, as `getTimezoneOffset` reports it, so +7 is -420.
        expect(formatGmtOffset(-420)).toBe('GMT +7')
        expect(formatGmtOffset(300)).toBe('GMT -5')
        expect(formatGmtOffset(0)).toBe('GMT +0')
    })

    it('prints half- and quarter-hour zones as minutes, not decimals', () => {
        // Legacy divides by 60 and renders `GMT +5.5`, which reads as a broken number.
        expect(formatGmtOffset(-330)).toBe('GMT +5:30')
        expect(formatGmtOffset(-345)).toBe('GMT +5:45')
        expect(formatGmtOffset(210)).toBe('GMT -3:30')
    })
})

describe('parseRangeParams', () => {
    it('reads the mobile app deep link', () => {
        const range = parseRangeParams(
            String(new Date(2025, 1, 10, 8, 0).getTime()),
            String(new Date(2025, 1, 12, 8, 0).getTime()),
            NOW,
        )
        expect(new Date(range?.startMs ?? 0)).toEqual(startOfDay(new Date(2025, 1, 10)))
        expect(new Date(range?.endMs ?? 0)).toEqual(endOfDay(new Date(2025, 1, 12)))
    })

    it('clamps a future end to tonight rather than dropping the link', () => {
        // A device whose clock is a few minutes fast is the common case; the day it names is still
        // the day it means.
        const range = parseRangeParams(
            String(new Date(2025, 1, 10).getTime()),
            String(new Date(2026, 1, 10).getTime()),
            NOW,
        )
        expect(new Date(range?.endMs ?? 0)).toEqual(endOfDay(NOW))
    })

    it.each([
        ['no params', null, null],
        ['one param', '1739923200000', null],
        ['not a number', 'yesterday', 'today'],
        ['zero', '0', '0'],
        ['a payload', "'; DROP TABLE", '1739923200000'],
    ])('returns null for %s', (_label, start, end) => {
        expect(parseRangeParams(start, end, NOW)).toBeNull()
    })
})
