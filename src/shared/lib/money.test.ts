import { describe, expect, it } from 'vitest'
import {
    type Currency,
    convertFromUsd,
    DEFAULT_CURRENCY,
    formatFiatAmount,
    formatStarAmount,
} from './money'

const USD = DEFAULT_CURRENCY
const VND: Currency = { code: 'VND', name: 'Vietnamese Dong', symbol: '₫', decimalDigits: 0 }
/** A currency whose payload carried no symbol — the code has to stand in for one. */
const NO_SYMBOL: Currency = { code: 'XAF', name: 'CFA Franc', symbol: '', decimalDigits: 0 }

describe('formatStarAmount', () => {
    it('groups digits and shows no decimals', () => {
        expect(formatStarAmount(1284)).toBe('1,284')
        expect(formatStarAmount(0)).toBe('0')
        expect(formatStarAmount(1_000_000)).toBe('1,000,000')
    })

    // Star is a count of a virtual item; there is no 3.5 Star to spend.
    it('rounds a fractional value rather than truncating it', () => {
        expect(formatStarAmount(1284.5)).toBe('1,285')
        expect(formatStarAmount(1284.4)).toBe('1,284')
    })

    it('uses the reader locale grouping', () => {
        expect(formatStarAmount(1284, 'vi')).toBe('1.284')
        expect(formatStarAmount(1284, 'de')).toBe('1.284')
    })

    it('reads a missing or unusable value as zero', () => {
        expect(formatStarAmount(null)).toBe('0')
        expect(formatStarAmount(undefined)).toBe('0')
        expect(formatStarAmount(Number.NaN)).toBe('0')
    })

    // An unrecognised tag makes `Intl` throw a RangeError; this is the function behind every figure
    // on the screen, so one bad tag must not blank the card and every row with it.
    it('survives a locale tag Intl does not know', () => {
        expect(formatStarAmount(1284, 'not-a-locale!!')).toBe('1,284')
    })
})

describe('formatFiatAmount', () => {
    it('pins the symbol in front and keeps the locale separators', () => {
        expect(formatFiatAmount(4400.03, USD)).toBe('$4,400.03')
        // Vietnamese writes 1.234,56 — the separators are the reader's, the `$` is ours.
        expect(formatFiatAmount(1234.56, USD, 'vi')).toBe('$1.234,56')
    })

    /*
     * The reason this cannot reuse `formatEarningsAmount`, which hard-codes two decimals:
     * `₫157,155,000.00` is not how anybody writes dong.
     */
    it('honours the currency decimal count', () => {
        expect(formatFiatAmount(157_155_000, VND)).toBe('₫157,155,000')
        expect(formatFiatAmount(4400, USD)).toBe('$4,400.00')
    })

    // A bare number with no unit is the one thing this must never produce.
    it('falls back to the code when the currency has no symbol', () => {
        expect(formatFiatAmount(1000, NO_SYMBOL)).toBe('XAF 1,000')
    })

    it('keeps a negative signed, with the sign outside the symbol', () => {
        expect(formatFiatAmount(-4.2, USD)).toBe('-$4.20')
        expect(formatFiatAmount(-1000, NO_SYMBOL)).toBe('-XAF 1,000')
    })

    it('reads a missing value as zero', () => {
        expect(formatFiatAmount(null, USD)).toBe('$0.00')
        expect(formatFiatAmount(Number.NaN, USD)).toBe('$0.00')
    })

    /*
     * A second clamp, behind the boundary parser's. `Intl` throws outside 0–100, and a throw here
     * takes down the balance card and every row under it — so a record that reached this function
     * with nonsense in it still renders.
     */
    it('survives an out-of-range decimal count rather than throwing', () => {
        const broken = { ...USD, decimalDigits: 99 }
        expect(() => formatFiatAmount(12.3456, broken)).not.toThrow()
        expect(formatFiatAmount(12.3456, broken)).toBe('$12.3456')
        const negative = { ...USD, decimalDigits: -5 }
        expect(formatFiatAmount(12.3456, negative)).toBe('$12')
    })

    it('survives a locale tag Intl does not know', () => {
        expect(formatFiatAmount(1234.5, USD, 'nope!!')).toBe('$1,234.50')
    })
})

describe('convertFromUsd', () => {
    it('multiplies by the rate', () => {
        expect(convertFromUsd(100, 25_400)).toBe(2_540_000)
    })

    /*
     * A rate of 1 is the fallback for every exchange-service failure, and this is what makes that
     * degrade to "shows USD" rather than to an error or a zero.
     */
    it('is the identity at a rate of 1', () => {
        expect(convertFromUsd(4400.03, 1)).toBe(4400.03)
    })

    it('treats an unusable rate as 1 rather than as zero', () => {
        expect(convertFromUsd(100, 0)).toBe(100)
        expect(convertFromUsd(100, -2)).toBe(100)
        expect(convertFromUsd(100, Number.NaN)).toBe(100)
    })

    it('reads an unusable amount as zero', () => {
        expect(convertFromUsd(Number.NaN, 25_400)).toBe(0)
    })
})
