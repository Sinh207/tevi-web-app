import { describe, expect, it } from 'vitest'
import { formatLedgerDateTime, formatLedgerMonth, ledgerMonthKey } from './ledger-time'

describe('formatLedgerDateTime', () => {
    it('renders a date and a time', () => {
        const result = formatLedgerDateTime(Date.UTC(2025, 1, 19, 14, 32))
        // The zone is the reader's, so the hour is not asserted — only that both parts are there.
        expect(result).toMatch(/2025/)
        expect(result).toMatch(/\d{2}:\d{2}/)
    })

    // So the caller can drop the line rather than print `Invalid Date`.
    it('returns an empty string for anything unreadable', () => {
        expect(formatLedgerDateTime(null)).toBe('')
        expect(formatLedgerDateTime(undefined)).toBe('')
        expect(formatLedgerDateTime(Number.NaN)).toBe('')
    })

    it('survives a locale tag Intl does not know', () => {
        expect(formatLedgerDateTime(Date.UTC(2025, 1, 19), 'nope!!')).not.toBe('')
    })
})

describe('ledgerMonthKey', () => {
    /*
     * Locale-independent by construction: two locales produce two different month *labels* for the same
     * month, so keying the buckets on the label would re-bucket the whole list on a language switch.
     */
    it('is stable across locales while the label is not', () => {
        const ts = new Date(2025, 1, 19, 14, 32).getTime()
        expect(ledgerMonthKey(ts)).toBe('2025-02')
        expect(formatLedgerMonth(ts, 'en')).not.toBe(formatLedgerMonth(ts, 'vi'))
    })

    it('pads a single-digit month', () => {
        expect(ledgerMonthKey(new Date(2025, 0, 5).getTime())).toBe('2025-01')
        expect(ledgerMonthKey(new Date(2025, 11, 5).getTime())).toBe('2025-12')
    })

    /*
     * Local time, to match `formatLedgerDateTime`: a row shown as `1 Mar, 00:30` must group under March,
     * which it would not if the key came from its UTC month.
     */
    it('agrees with the local month the row is labelled with', () => {
        expect(ledgerMonthKey(new Date(2025, 2, 1, 0, 30).getTime())).toBe('2025-03')
    })

    it('returns an empty string for an unreadable value', () => {
        expect(ledgerMonthKey(Number.NaN)).toBe('')
    })
})

describe('formatLedgerMonth', () => {
    it('renders the month and the year', () => {
        expect(formatLedgerMonth(new Date(2025, 1, 19).getTime(), 'en')).toBe('February 2025')
    })

    it('returns an empty string for an unreadable value', () => {
        expect(formatLedgerMonth(Number.NaN)).toBe('')
    })

    it('survives a locale tag Intl does not know', () => {
        expect(formatLedgerMonth(new Date(2025, 1, 19).getTime(), 'nope!!')).toBe('February 2025')
    })
})
