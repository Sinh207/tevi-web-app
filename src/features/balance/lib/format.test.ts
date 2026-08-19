import { type Currency, DEFAULT_CURRENCY } from '@shared/lib/money'
import { describe, expect, it } from 'vitest'
import { formatLedgerAmount, isStarEntry } from './format'

const USD = DEFAULT_CURRENCY
const VND: Currency = { code: 'VND', name: 'Vietnamese Dong', symbol: '₫', decimalDigits: 0 }

/**
 * The one money function that knows what `TVS` means, which is why it lives in this feature rather than in
 * `shared/lib/money.ts`. Both ledger screens call it, so a change here moves both.
 */
describe('formatLedgerAmount', () => {
    const base = { displayCurrency: USD, rate: 1, locale: 'en' }

    // A ledger is read as a column of movements, so "did this add or subtract" has to be legible without
    // comparing against the row above. Legacy prefixes `+` for `>= 0`.
    it('prefixes a plus on anything not negative', () => {
        expect(formatLedgerAmount({ ...base, amount: 500, currency: 'TVS' })).toBe('+500')
        // Zero gets one too, following legacy: a netted-out adjustment is not money leaving.
        expect(formatLedgerAmount({ ...base, amount: 0, currency: 'TVS' })).toBe('+0')
    })

    it('lets the number carry its own minus', () => {
        expect(formatLedgerAmount({ ...base, amount: -120, currency: 'TVS' })).toBe('-120')
        expect(formatLedgerAmount({ ...base, amount: -4.2, currency: 'TEVI' })).toBe('-$4.20')
    })

    /*
     * The unit comes from the ROW's currency, not the screen's. A currency ledger can contain a Star row —
     * a `conversion` has a leg in each — and showing that with a dollar sign would misreport it by a factor
     * of a hundred.
     */
    it('formats a Star row as Star even on a fiat screen', () => {
        expect(
            formatLedgerAmount({
                amount: 500,
                currency: 'TVS',
                displayCurrency: VND,
                rate: 25_400,
            }),
        ).toBe('+500')
    })

    it('converts and formats a fiat row in the chosen currency', () => {
        expect(
            formatLedgerAmount({
                amount: 100,
                currency: 'TEVI',
                displayCurrency: VND,
                rate: 25_400,
            }),
        ).toBe('+₫2,540,000')
    })

    // Inventing a unit is worse than omitting one.
    it('shows a bare number when the row carried no currency', () => {
        expect(formatLedgerAmount({ ...base, amount: 12.5, currency: '' })).toBe('+12.5')
        expect(formatLedgerAmount({ ...base, amount: -12.5, currency: '' })).toBe('-12.5')
        // No trailing `.00` either: with no currency there is no `decimalDigits` to honour.
        expect(formatLedgerAmount({ ...base, amount: 4, currency: '' })).toBe('+4')
    })

    it('groups a bare number in the reader locale', () => {
        expect(formatLedgerAmount({ ...base, amount: 12345.5, currency: '', locale: 'vi' })).toBe(
            '+12.345,5',
        )
    })
})

describe('isStarEntry', () => {
    // Decides whether the row draws the gold mark, so a false positive labels money as Star.
    it('recognises only the Star code', () => {
        expect(isStarEntry('TVS')).toBe(true)
        expect(isStarEntry('TEVI')).toBe(false)
        expect(isStarEntry('USD')).toBe(false)
        expect(isStarEntry('')).toBe(false)
        // The parser upper-cases, so a lower-case code never reaches here — and is not accepted if it does.
        expect(isStarEntry('tvs')).toBe(false)
    })
})
