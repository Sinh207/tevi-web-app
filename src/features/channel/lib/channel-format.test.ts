import { describe, expect, it } from 'vitest'
import {
    DESCRIPTION_MAX,
    formatActivityDateTime,
    formatCompactCount,
    formatExactCount,
    formatIncomeUsd,
    formatJoinedDate,
    formatRelativeTime,
    truncateDescription,
} from './channel-format'

describe('formatCompactCount', () => {
    /** A creator with 999 followers should see 999, not `1K`. */
    it('keeps counts below a thousand exact', () => {
        expect(formatCompactCount(0)).toBe('0')
        expect(formatCompactCount(7)).toBe('7')
        expect(formatCompactCount(999)).toBe('999')
    })

    it('compacts from a thousand up', () => {
        expect(formatCompactCount(1000)).toBe('1K')
        expect(formatCompactCount(1500)).toBe('1.5K')
        expect(formatCompactCount(241_000)).toBe('241K')
        expect(formatCompactCount(1_000_000)).toBe('1M')
    })

    /** `0`, not `NaN` or `-5` — both are things a payload can produce. */
    it('floors anything that is not a usable number', () => {
        for (const value of [null, undefined, Number.NaN, Number.POSITIVE_INFINITY, -5]) {
            expect(formatCompactCount(value as number), String(value)).toBe('0')
        }
    })

    /** Compact notation is not universal, which is why this goes through Intl at all. */
    it('is locale-aware', () => {
        expect(formatCompactCount(1200, 'ja')).not.toBe(formatCompactCount(1200, 'en'))
    })

    it('falls back to en rather than throwing on a bad locale tag', () => {
        expect(formatCompactCount(1500, 'not-a-locale!!')).toBe('1.5K')
    })
})

describe('formatExactCount', () => {
    it('renders the unabbreviated number for the accessible label', () => {
        expect(formatExactCount(241_356, 'en')).toBe('241,356')
        expect(formatExactCount(0)).toBe('0')
        expect(formatExactCount(null)).toBe('0')
    })
})

describe('formatJoinedDate', () => {
    it('formats a real timestamp', () => {
        expect(formatJoinedDate('2026-02-01T00:00:00Z', 'en')).toMatch(/Feb/)
    })

    /**
     * `new Date('nonsense').toLocaleDateString()` renders the words "Invalid Date" into the
     * page. Empty lets the caller drop the row instead.
     */
    it('returns empty rather than the words Invalid Date', () => {
        for (const value of ['', '   ', 'nonsense', null, undefined]) {
            expect(formatJoinedDate(value), String(value)).toBe('')
        }
    })

    it('renders per locale', () => {
        const iso = '2026-02-01T00:00:00Z'
        expect(formatJoinedDate(iso, 'vi')).not.toBe(formatJoinedDate(iso, 'en'))
        expect(formatJoinedDate(iso, 'ar')).toBeTruthy()
    })
})

describe('formatIncomeUsd', () => {
    it('renders compact dollars', () => {
        expect(formatIncomeUsd(244, 'en')).toBe('$244')
        expect(formatIncomeUsd(12_400, 'en')).toBe('$12.4K')
    })

    it('floors a missing or negative amount', () => {
        expect(formatIncomeUsd(null)).toBe('$0')
        expect(formatIncomeUsd(-10)).toBe('$0')
    })

    /**
     * The bug this pins: `style: 'currency'` renders USD the way each locale writes *foreign*
     * money, so Vietnamese showed `0,1 US$` in a stat column the DS draws as `$0.1`. Six of the
     * nine locales were wrong, and `currencyDisplay: 'narrowSymbol'` fixes only four of them —
     * `vi` keeps the symbol trailing and `ar` ignores the option entirely.
     */
    it('always leads with a literal $, in every locale', () => {
        for (const locale of ['en', 'vi', 'id', 'ms', 'fil', 'ko', 'zh-CN', 'zh-TW', 'ar']) {
            expect(formatIncomeUsd(244, locale), locale).toBe('$244')
        }
    })

    it('still localises the number itself', () => {
        // The separator is the locale's; only the currency mark is pinned.
        expect(formatIncomeUsd(0.1, 'vi')).toBe('$0,1')
        expect(formatIncomeUsd(0.1, 'en')).toBe('$0.1')
        // …as is the compact magnitude. ` ` and not a space: `Intl` separates the number from
        // its magnitude with a non-breaking space, which is the point — `12,4` and `N` must not be
        // allowed to wrap apart inside a stat column.
        expect(formatIncomeUsd(12_400, 'vi')).toBe('$12,4 N')
        expect(formatIncomeUsd(12_400, 'zh-CN')).toBe('$1.2万')
    })

    it('falls back to en rather than throwing on a bad locale tag', () => {
        expect(formatIncomeUsd(244, 'not-a-locale')).toBe('$244')
    })
})

describe('formatActivityDateTime', () => {
    // 2025-02-20T14:30:00Z. Asserted against the runner's zone via a locally-built expectation
    // rather than a literal, so the test does not silently depend on the machine being in UTC.
    const AT = '2025-02-20T14:30:00.000Z'
    const local = (locale: string) =>
        new Intl.DateTimeFormat(locale, {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
        }).format(new Date(AT))

    it('carries the year and the clock time — this is a receipt, not a social timestamp', () => {
        const out = formatActivityDateTime(AT, 'en')
        expect(out).toBe(local('en'))
        expect(out).toMatch(/2025/)
        // hh:mm, in whatever position the locale puts it.
        expect(out).toMatch(/\d{2}:\d{2}/)
    })

    it('pins 24-hour time in every locale, as legacy’s HH:mm does', () => {
        for (const locale of ['en', 'vi', 'id', 'ms', 'fil', 'ko', 'zh-CN', 'zh-TW', 'ar']) {
            expect(formatActivityDateTime(AT, locale), locale).not.toMatch(/AM|PM/i)
        }
    })

    it('lets the locale order the date', () => {
        expect(formatActivityDateTime(AT, 'vi')).toBe(local('vi'))
    })

    it('is empty rather than “Invalid Date” for anything unparseable', () => {
        for (const value of [null, undefined, '', 'nonsense']) {
            expect(formatActivityDateTime(value), String(value)).toBe('')
        }
    })

    it('falls back to en rather than throwing on a bad locale tag', () => {
        expect(formatActivityDateTime(AT, 'not-a-locale')).toBe(local('en'))
    })
})

/**
 * The joined date must not depend on where it is rendered.
 *
 * `ChannelBio` is a client component, so it renders on the server too. Before this was pinned the
 * server emitted `Joined Aug 15, 2022` for a channel a Los Angeles browser rendered as `Aug 14` —
 * a hydration mismatch, and with the page cached, a wrong date served to everyone in between.
 * Measured in a real browser across four zones; this is the unit-level guard.
 */
describe('formatJoinedDate is timezone-independent', () => {
    // 22:41 UTC — already the next day in Vietnam, still the previous one in California.
    const AT = '2022-08-14T22:41:20.264Z'

    it('formats the UTC date, whatever zone the runner is in', () => {
        expect(formatJoinedDate(AT, 'en')).toBe('Aug 14, 2022')
    })

    it('does not shift with a value near the other edge of the day', () => {
        expect(formatJoinedDate('2022-08-15T00:30:00.000Z', 'en')).toBe('Aug 15, 2022')
        expect(formatJoinedDate('2022-08-14T23:59:59.000Z', 'en')).toBe('Aug 14, 2022')
    })

    it('still localises the month name', () => {
        expect(formatJoinedDate(AT, 'vi')).toContain('2022')
        expect(formatJoinedDate(AT, 'vi')).not.toBe(formatJoinedDate(AT, 'en'))
    })
})

/**
 * The coarse relative stamp. `now` is passed in at every call — the function's own note explains why
 * that is a correctness rule (it must not run during SSR) and not merely a testing convenience.
 */
describe('formatRelativeTime', () => {
    const NOW = Date.parse('2026-08-24T12:00:00.000Z')
    const ago = (ms: number) => new Date(NOW - ms).toISOString()

    it('walks the unit ladder in the order legacy does', () => {
        expect(formatRelativeTime(ago(20_000), 'en', NOW)).toBe('20 seconds ago')
        expect(formatRelativeTime(ago(5 * 60_000), 'en', NOW)).toBe('5 minutes ago')
        expect(formatRelativeTime(ago(3 * 3_600_000), 'en', NOW)).toBe('3 hours ago')
        expect(formatRelativeTime(ago(4 * 86_400_000), 'en', NOW)).toBe('4 days ago')
        expect(formatRelativeTime(ago(70 * 86_400_000), 'en', NOW)).toBe('2 months ago')
        expect(formatRelativeTime(ago(800 * 86_400_000), 'en', NOW)).toBe('2 years ago')
    })

    /**
     * `numeric: 'auto'` is what turns a count into a sentence — with `'always'` this reads
     * "1 day ago", which is the tell that the option was dropped.
     */
    it('uses the locale idiom rather than a bare count', () => {
        expect(formatRelativeTime(ago(86_400_000), 'en', NOW)).toBe('yesterday')
        expect(formatRelativeTime(ago(31 * 86_400_000), 'en', NOW)).toBe('last month')
    })

    /** A scheduled stream is in the future, and the sign has to survive. */
    it('handles a future time', () => {
        expect(formatRelativeTime(new Date(NOW + 3 * 3_600_000).toISOString(), 'en', NOW)).toBe(
            'in 3 hours',
        )
    })

    it('localises', () => {
        const vi = formatRelativeTime(ago(4 * 86_400_000), 'vi', NOW)
        expect(vi).not.toBe(formatRelativeTime(ago(4 * 86_400_000), 'en', NOW))
        expect(vi).toContain('4')
    })

    /** `''` and not `'Invalid Date'`, so the caller can drop the whole line. */
    it('answers an empty string for anything it cannot read', () => {
        expect(formatRelativeTime(null, 'en', NOW)).toBe('')
        expect(formatRelativeTime(undefined, 'en', NOW)).toBe('')
        expect(formatRelativeTime('', 'en', NOW)).toBe('')
        expect(formatRelativeTime('nonsense', 'en', NOW)).toBe('')
    })

    /** An unrecognised tag must not take the row down — the guard every formatter here carries. */
    it('falls back to English on a bad locale tag', () => {
        expect(formatRelativeTime(ago(5 * 60_000), 'not-a-locale!!', NOW)).toBe('5 minutes ago')
    })
})

/**
 * The overflow cases: rounding inside a unit can reach the next unit's threshold, so without the
 * promotion these render "60 minutes ago", "24 hours ago" and "12 months ago". Every one is
 * reachable from a real timestamp and invisible to a test that samples the middle of a branch.
 */
describe('formatRelativeTime promotes a rounded value that overflows its unit', () => {
    const NOW = Date.parse('2026-08-24T12:00:00.000Z')
    const ago = (seconds: number) => new Date(NOW - seconds * 1000).toISOString()

    it('never says 60 minutes', () => {
        expect(formatRelativeTime(ago(3599), 'en', NOW)).toBe('1 hour ago')
    })

    it('never says 24 hours', () => {
        expect(formatRelativeTime(ago(86_399), 'en', NOW)).toBe('yesterday')
    })

    it('never says 12 months', () => {
        expect(formatRelativeTime(ago(31_535_999), 'en', NOW)).toBe('last year')
    })

    it('never says 30 days', () => {
        expect(formatRelativeTime(ago(2_591_999), 'en', NOW)).toBe('last month')
    })

    /** And the same in the other direction, for a scheduled stream. */
    it('promotes a future value too', () => {
        expect(formatRelativeTime(new Date(NOW + 3599 * 1000).toISOString(), 'en', NOW)).toBe(
            'in 1 hour',
        )
    })

    /** Under a second is "now", not "0 seconds ago" — `numeric: 'auto'` says so. */
    it('reads a moment ago as now', () => {
        expect(formatRelativeTime(ago(0), 'en', NOW)).toBe('now')
    })
})

describe('truncateDescription', () => {
    it('leaves a bio that already fits', () => {
        expect(truncateDescription('Short bio')).toBe('Short bio')
        expect(truncateDescription('x'.repeat(DESCRIPTION_MAX))).toHaveLength(DESCRIPTION_MAX)
    })

    it('cuts at a word and marks the cut', () => {
        const text = `${'word '.repeat(60)}end`
        const out = truncateDescription(text)

        expect(out.endsWith('…')).toBe(true)
        expect(out.endsWith(' …')).toBe(false)
        expect(Array.from(out).length).toBeLessThanOrEqual(DESCRIPTION_MAX + 1)
        // Never mid-word: everything before the ellipsis is whole words.
        expect(out.slice(0, -1).endsWith('word')).toBe(true)
    })

    it('cuts an unbroken run at the limit rather than throwing it away', () => {
        // No space to back up to — a URL, or a language that does not space its words. Backing up
        // to a space three lines earlier would drop most of the bio.
        const out = truncateDescription('x'.repeat(400))
        expect(Array.from(out).length).toBe(DESCRIPTION_MAX + 1)
    })

    it('does not split an emoji in half', () => {
        /*
         * `slice` counts UTF-16 units, so cutting at 200 lands inside the surrogate pair and renders
         * as `�`. `Array.from` counts code points, which is what the reader counts.
         */
        const out = truncateDescription(`${'🎧'.repeat(150)}`, 10)

        /*
         * A **lone** surrogate is the failure: a high one with no low after it, or a low one with no
         * high before it. Matching `[\uD800-\uDFFF]` alone is wrong — that flags the second half of
         * every well-formed pair, which is how this assertion failed against correct output.
         */
        expect(out).not.toMatch(
            /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/,
        )
        expect(Array.from(out)).toHaveLength(11)
    })
})
