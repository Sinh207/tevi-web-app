import { describe, expect, it } from 'vitest'
import {
    formatEarningsAmount,
    formatEarningsDate,
    matchesEarningsDateParam,
    parseEarningsDateParam,
} from './format'

describe('formatEarningsAmount', () => {
    it('is exact and always carries cents', () => {
        expect(formatEarningsAmount(12_412.5)).toBe('$12,412.50')
        expect(formatEarningsAmount(0)).toBe('$0.00')
    })

    /**
     * The separators are the reader's; the `$` is not. `Intl`'s `style: 'currency'` writes USD the
     * way each locale writes *foreign* money — `12.412,50 US$` in Vietnamese — and the design draws
     * a leading `$` in all nine locales. See the doc on `formatIncomeUsd` for the full table.
     */
    it('localises the number and pins the symbol', () => {
        expect(formatEarningsAmount(12_412.5, 'vi')).toBe('$12.412,50')
        expect(formatEarningsAmount(12_412.5, 'de')).toBe('$12.412,50')
    })

    /**
     * Refunds and chargebacks are real. `formatIncomeUsd` clamps to 0, correctly, for a lifetime
     * headline — doing that here would hide the one row a creator most wants to ask about.
     */
    it('keeps a negative amount negative', () => {
        expect(formatEarningsAmount(-4.2)).toBe('-$4.20')
    })

    it('never renders NaN', () => {
        expect(formatEarningsAmount(Number.NaN)).toBe('$0.00')
        expect(formatEarningsAmount(null)).toBe('$0.00')
        expect(formatEarningsAmount(undefined)).toBe('$0.00')
    })

    it('falls back to English rather than throwing on a bad locale tag', () => {
        expect(formatEarningsAmount(1234.5, 'not-a-locale')).toBe('$1,234.50')
    })
})

describe('formatEarningsDate', () => {
    /**
     * **The bug this pin exists for.** A row is a calendar day the server bucketed, not a moment.
     * Formatted in the reader's zone, a bucket stamped at midnight UTC renders as the *previous*
     * day for anyone west of it — every row, silently, with the amounts still right. Legacy has
     * this. The assertion is written against a fixed UTC midnight, so it fails if the pin is
     * removed and the suite runs in a negative-offset zone.
     */
    it('renders the bucket’s own UTC date, not the reader’s', () => {
        const utcMidnight = Date.UTC(2025, 1, 19, 0, 0, 0)
        expect(formatEarningsDate(utcMidnight, 'en')).toBe('Feb 19, 2025')
        // One millisecond before the next UTC midnight is still the same day.
        expect(formatEarningsDate(utcMidnight + 86_399_999, 'en')).toBe('Feb 19, 2025')
    })

    it('lets the locale order the parts', () => {
        expect(formatEarningsDate(Date.UTC(2025, 1, 19), 'vi')).toContain('2025')
    })

    /** `''`, so the caller can drop the row — never the words `Invalid Date` on screen. */
    it('is empty for a value that is not a timestamp', () => {
        expect(formatEarningsDate(null)).toBe('')
        expect(formatEarningsDate(undefined)).toBe('')
        expect(formatEarningsDate(Number.NaN)).toBe('')
    })
})

describe('parseEarningsDateParam', () => {
    it('reads legacy’s seconds segment', () => {
        expect(parseEarningsDateParam('1739923200')).toBe(1_739_923_200)
        expect(parseEarningsDateParam('%201739923200%20')).toBe(1_739_923_200)
    })

    /**
     * The segment comes straight off the path, so this is reached by whatever anyone types. `null`
     * means "no row pre-expanded", which is the parent route — deliberately not a 404, since the
     * segment is a hint about scroll position rather than a resource.
     */
    it('is null for anything that is not a positive integer', () => {
        for (const value of ['', 'today', '-1', '0', '12.5', "'; DROP", '%zz', undefined, null]) {
            expect(parseEarningsDateParam(value)).toBeNull()
        }
    })
})

describe('matchesEarningsDateParam', () => {
    /** The one place the URL's seconds and the row's milliseconds are allowed to meet. */
    it('matches a millisecond row against a seconds segment', () => {
        expect(matchesEarningsDateParam(1_739_923_200_000, 1_739_923_200)).toBe(true)
        // Any moment inside the same second still matches — the row is a bucket, not an instant.
        expect(matchesEarningsDateParam(1_739_923_200_999, 1_739_923_200)).toBe(true)
        expect(matchesEarningsDateParam(1_739_923_201_000, 1_739_923_200)).toBe(false)
    })

    it('never matches when the URL named no day', () => {
        expect(matchesEarningsDateParam(1_739_923_200_000, null)).toBe(false)
    })
})
