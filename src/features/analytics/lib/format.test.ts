import { describe, expect, it } from 'vitest'
import {
    formatAxisValue,
    formatBucketLabel,
    formatMetricValue,
    formatPercentChange,
    formatRangeLabel,
} from './format'

/**
 * The values this screen formats itself — the chart's axis and tooltip, the percentage, and the two
 * date-field conversions.
 *
 * The headline figures are not here because they are not formatted here: `display` and `prev_display`
 * arrive pre-formatted and are printed verbatim (see the file's own header).
 */

describe('formatMetricValue', () => {
    it('goes compact in the thousands, so a 52px axis label fits', () => {
        expect(formatMetricValue(1234.5, { currencyDisplay: '$' })).toBe('$1.2K')
        expect(formatMetricValue(1_250_000, { currencyDisplay: '$' })).toBe('$1.3M')
    })

    it('keeps two decimals on money below a thousand, so a column aligns', () => {
        expect(formatMetricValue(4.2, { currencyDisplay: '$' })).toBe('$4.20')
        expect(formatMetricValue(0, { currencyDisplay: '$' })).toBe('$0.00')
    })

    it('rounds a count and keeps decimals on a fractional non-currency metric', () => {
        expect(formatMetricValue(3.7, { isInteger: true })).toBe('4')
        // Legacy ignores `is_integer` and rounds everything without a symbol, so an average would
        // print as a whole number.
        expect(formatMetricValue(3.75, { isInteger: false })).toBe('3.75')
    })

    it('reads a missing value as zero rather than NaN', () => {
        expect(formatMetricValue(null, { currencyDisplay: '$' })).toBe('$0.00')
        expect(formatMetricValue(undefined, {})).toBe('0')
        expect(formatMetricValue(Number.NaN, {})).toBe('0')
    })

    it('pins the symbol leading and leaves the separators to the locale', () => {
        // `Intl`'s own currency style writes USD the way each locale writes *foreign* money — `1.234,56
        // US$` in Vietnamese. The design draws `$` leading in all nine, and `display` already did.
        expect(formatMetricValue(12.5, { currencyDisplay: '$' }, 'vi')).toBe('$12,50')
    })

    it('falls back to English on a malformed locale tag instead of throwing', () => {
        expect(formatMetricValue(12.5, { currencyDisplay: '$' }, 'not a tag')).toBe('$12.50')
    })
})

describe('formatAxisValue', () => {
    it('drops the cents a money tooltip keeps, so one axis is not two formats', () => {
        // The bug this exists for: `$1.4K · $1.2K · $1K · $800.00 · $600.00` down one column.
        expect(formatAxisValue(800, { currencyDisplay: '$' })).toBe('$800')
        expect(formatAxisValue(1400, { currencyDisplay: '$' })).toBe('$1.4K')
        expect(formatMetricValue(800, { currencyDisplay: '$' })).toBe('$800.00')
    })

    it('keeps decimals on a fractional tick, which a small domain produces', () => {
        expect(formatAxisValue(0.5, { currencyDisplay: '$' })).toBe('$0.5')
        expect(formatAxisValue(0.5, { currencyDisplay: '$', isInteger: true })).toBe('$1')
    })

    it('needs no symbol for a count', () => {
        expect(formatAxisValue(24, { isInteger: true })).toBe('24')
    })
})

describe('formatPercentChange', () => {
    it('is unsigned — the arrow beside it carries the direction', () => {
        expect(formatPercentChange(-12.5)).toBe('12.5%')
        expect(formatPercentChange(12.5)).toBe('12.5%')
    })

    it('trims trailing zeros and caps at two decimals', () => {
        expect(formatPercentChange(100)).toBe('100%')
        expect(formatPercentChange(83.3)).toBe('83.3%')
        expect(formatPercentChange(74.24999999)).toBe('74.25%')
    })

    it('reads a missing figure as zero', () => {
        expect(formatPercentChange(null)).toBe('0%')
        expect(formatPercentChange(Number.NaN)).toBe('0%')
    })
})

describe('formatBucketLabel', () => {
    const noon = new Date(2025, 1, 19, 14, 30).getTime()

    it('prints a date for daily and weekly buckets', () => {
        expect(formatBucketLabel(noon, 24, 'en')).toBe('Feb 19')
        expect(formatBucketLabel(noon, 168, 'en')).toBe('Feb 19')
    })

    it('prints a time for hourly ones, where every bucket shares a date', () => {
        expect(formatBucketLabel(noon, 1, 'en')).toMatch(/2:30/)
    })

    it('is empty for an unreadable value, so the caller can drop the label', () => {
        expect(formatBucketLabel(null, 24)).toBe('')
        expect(formatBucketLabel(Number.NaN, 24)).toBe('')
    })
})

describe('formatRangeLabel', () => {
    it('drops the year when both ends share it', () => {
        const label = formatRangeLabel(
            {
                startMs: new Date(2025, 1, 19).getTime(),
                endMs: new Date(2025, 2, 20).getTime(),
            },
            'en',
        )
        expect(label).toBe('February 19 – March 20')
    })

    it('shows the year on both ends when a range straddles New Year', () => {
        const label = formatRangeLabel(
            {
                startMs: new Date(2024, 11, 20).getTime(),
                endMs: new Date(2025, 0, 5).getTime(),
            },
            'en',
        )
        expect(label).toBe('December 20, 2024 – January 5, 2025')
    })
})
