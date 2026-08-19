import { describe, expect, it } from 'vitest'
import { normalizeBalance, normalizeLedger } from './types'

/**
 * These parsers stand between the billing service and a screen that shows somebody their money, so the
 * cases below are the payload shapes that would otherwise produce a *plausible wrong number* — not a
 * crash. That is the failure mode worth testing here.
 */

describe('normalizeBalance', () => {
    it('reads both balances by currency code', () => {
        expect(
            normalizeBalance({
                balances: [
                    { amount: 1284, amount_currency: 'TVS' },
                    { amount: 4400.03, amount_currency: 'TEVI' },
                ],
            }),
        ).toEqual({ star: 1284, usd: 4400.03 })
    })

    it('does not care what order the entries arrive in', () => {
        expect(
            normalizeBalance({
                balances: [
                    { amount: 4400.03, amount_currency: 'TEVI' },
                    { amount: 1284, amount_currency: 'TVS' },
                ],
            }),
        ).toEqual({ star: 1284, usd: 4400.03 })
    })

    // Legacy compares `amount_currency?.toUpperCase()` at every site, which is the evidence the wire
    // value is not guaranteed. Upper-casing once at the boundary is what lets the rest use `===`.
    it('matches the currency code case-insensitively', () => {
        expect(normalizeBalance({ balances: [{ amount: 50, amount_currency: 'tvs' }] })).toEqual({
            star: 50,
            usd: 0,
        })
    })

    it('accepts amounts sent as numeric strings', () => {
        expect(
            normalizeBalance({
                balances: [
                    { amount: '1284', amount_currency: 'TVS' },
                    { amount: '4400.03', amount_currency: 'TEVI' },
                ],
            }),
        ).toEqual({ star: 1284, usd: 4400.03 })
    })

    /*
     * The bug this exists to prevent: legacy only writes its state when `balances.length > 0`, and it
     * holds one global balance rather than one per account — so switching into a brand-new account shows
     * the *previous* account's figures. Zero is what an account with no money has.
     */
    it('reads a missing entry as zero rather than leaving it unset', () => {
        expect(normalizeBalance({ balances: [] })).toEqual({ star: 0, usd: 0 })
        expect(normalizeBalance({ balances: [{ amount: 7, amount_currency: 'TVS' }] })).toEqual({
            star: 7,
            usd: 0,
        })
    })

    it('survives a body that is not the expected shape at all', () => {
        expect(normalizeBalance(null)).toEqual({ star: 0, usd: 0 })
        expect(normalizeBalance({})).toEqual({ star: 0, usd: 0 })
        expect(normalizeBalance('nope')).toEqual({ star: 0, usd: 0 })
        expect(normalizeBalance({ balances: 'nope' })).toEqual({ star: 0, usd: 0 })
    })

    // Never `NaN`: it would render as `NaN` in the drawer, the top bar and both screens at once.
    it('reads an unreadable amount as zero, never NaN', () => {
        const result = normalizeBalance({
            balances: [
                { amount: 'abc', amount_currency: 'TVS' },
                { amount: null, amount_currency: 'TEVI' },
            ],
        })
        expect(result).toEqual({ star: 0, usd: 0 })
        expect(Number.isNaN(result.star)).toBe(false)
    })

    it('ignores a currency it does not model', () => {
        expect(
            normalizeBalance({
                balances: [
                    { amount: 9, amount_currency: 'BTC' },
                    { amount: 3, amount_currency: 'TVS' },
                ],
            }),
        ).toEqual({ star: 3, usd: 0 })
    })
})

describe('normalizeLedger', () => {
    const row = {
        id: 't1',
        type: 'top_up',
        description: 'Star purchase',
        created_at: '2025-02-19T14:32:00Z',
        currency: 'TVS',
        amount: 500,
    }

    it('parses an ISO timestamp to epoch milliseconds', () => {
        const [entry] = normalizeLedger({ results: [row] })
        expect(entry.createdAt).toBe(Date.parse('2025-02-19T14:32:00Z'))
        expect(entry).toMatchObject({ id: 't1', type: 'top_up', currency: 'TVS', amount: 500 })
    })

    it('accepts the array bare as well as under results', () => {
        expect(normalizeLedger([row])).toHaveLength(1)
        expect(normalizeLedger({ results: [row] })).toHaveLength(1)
        expect(normalizeLedger({})).toEqual([])
    })

    /*
     * A bare numeric string must be read as an epoch, not handed to `Date.parse` — which reads
     * '1739923200' as the year 1739923200 in V8.
     */
    it('reads a numeric-string timestamp as an epoch, not as a year', () => {
        const [entry] = normalizeLedger([{ ...row, created_at: '1739975520' }])
        expect(entry.createdAt).toBe(1_739_975_520_000)
    })

    it('promotes a seconds timestamp to milliseconds', () => {
        expect(normalizeLedger([{ ...row, created_at: 1_739_975_520 }])[0].createdAt).toBe(
            1_739_975_520_000,
        )
        // …and leaves a millisecond one alone.
        expect(normalizeLedger([{ ...row, created_at: 1_739_975_520_000 }])[0].createdAt).toBe(
            1_739_975_520_000,
        )
    })

    // A row with no date cannot be labelled, cannot be grouped by month, and has nothing to be except an
    // amount on no particular day.
    it('drops a row whose timestamp cannot be read', () => {
        expect(normalizeLedger([{ ...row, created_at: null }])).toEqual([])
        expect(normalizeLedger([{ ...row, created_at: 'not a date' }])).toEqual([])
        expect(normalizeLedger([{ ...row, created_at: 0 }])).toEqual([])
    })

    it('lower-cases the type so each screen label lookup can be exact', () => {
        expect(normalizeLedger([{ ...row, type: 'TOP_UP' }])[0].type).toBe('top_up')
    })

    /*
     * The `net_amount` rule, from legacy's `EARNING_TYPES`: for these two the row carries a gross
     * `amount` and a post-fee `net_amount`, and a wallet must show the net — it has to match what
     * actually landed. This lives in the parser rather than in either screen because it is a property of
     * the payload.
     */
    it('shows the net figure for an earning type', () => {
        const [entry] = normalizeLedger([
            {
                ...row,
                type: 'platform_earning',
                currency: 'TEVI',
                amount: 100,
                net_amount: 85,
                net_amount_currency: 'TEVI',
            },
        ])
        expect(entry.amount).toBe(85)
        expect(entry.currency).toBe('TEVI')
    })

    it('shows the gross figure for every other type', () => {
        expect(
            normalizeLedger([{ ...row, type: 'refund', amount: 100, net_amount: 85 }])[0].amount,
        ).toBe(100)
    })

    it('falls back to the row currency when an earning row has no net currency', () => {
        const [entry] = normalizeLedger([
            { ...row, type: 'commission', currency: 'TEVI', amount: 10, net_amount: 9 },
        ])
        expect(entry.currency).toBe('TEVI')
        expect(entry.amount).toBe(9)
    })

    it('keeps a negative amount signed', () => {
        expect(normalizeLedger([{ ...row, type: 'consumption', amount: -120 }])[0].amount).toBe(
            -120,
        )
    })

    /*
     * Legacy keys rows by array index, and these lists grow at the top as pages load — so every index
     * shifts and React reuses the wrong row. The fallback has to be derived from the row itself.
     */
    it('derives a stable id when the row has none', () => {
        const [entry] = normalizeLedger([{ ...row, id: undefined }])
        expect(entry.id).toBe(`top_up-${Date.parse('2025-02-19T14:32:00Z')}`)
    })

    it('stringifies a numeric id', () => {
        expect(normalizeLedger([{ ...row, id: 42 }])[0].id).toBe('42')
    })

    /*
     * NOT re-sorted, unlike the earnings report: these lists are paginated, so sorting would order only
     * the twenty rows that happened to arrive together and produce a list that is locally ordered and
     * globally not.
     */
    it('preserves the server order', () => {
        const older = { ...row, id: 'a', created_at: '2025-01-01T00:00:00Z' }
        const newer = { ...row, id: 'b', created_at: '2025-03-01T00:00:00Z' }
        expect(normalizeLedger([older, newer]).map(e => e.id)).toEqual(['a', 'b'])
    })

    it('keeps an unknown type rather than dropping the row', () => {
        expect(normalizeLedger([{ ...row, type: 'space_tier_bonus' }])[0].type).toBe(
            'space_tier_bonus',
        )
    })

    it('tolerates a missing currency', () => {
        expect(normalizeLedger([{ ...row, currency: undefined }])[0].currency).toBe('')
    })
})
