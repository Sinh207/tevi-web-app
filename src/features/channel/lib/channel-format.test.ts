import { describe, expect, it } from 'vitest'
import {
    formatActivityDateTime,
    formatCompactCount,
    formatExactCount,
    formatIncomeUsd,
    formatJoinedDate,
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
