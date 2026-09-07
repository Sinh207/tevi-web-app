import { describe, expect, it } from 'vitest'
import { normalizePayoutRequestPage, normalizePayoutRequests } from './types'

/**
 * The parse is the whole reason this layer exists, and every case below is one legacy handles at a
 * call site instead — `parseFloat(payout?.net_amount) || 0`, `payout?.status || ''`,
 * `payout?.request_number || ''`. Four screens each coercing the same wire values is four chances to
 * do it differently; these pin the one answer.
 *
 * The figures matter more than usual: `net_amount` is what a creator is owed.
 */
describe('normalizePayoutRequests', () => {
    it('reads a full row', () => {
        const [row] = normalizePayoutRequests([
            {
                id: 42,
                request_number: 10428,
                status: 'PENDING',
                created_at: '2025-02-19T14:32:00Z',
                net_amount: '1240.50',
                net_amount_currency: 'usd',
            },
        ])
        expect(row).toEqual({
            // `id` and `request_number` both arrive as numbers and are used as strings.
            id: '42',
            requestNumber: '10428',
            // Lower-cased, because the status table is keyed in lower case.
            status: 'pending',
            createdAt: Date.parse('2025-02-19T14:32:00Z'),
            // A **string** on the wire. This is the coercion legacy repeats per screen.
            netAmount: 1240.5,
            // Upper-cased, because it is printed as a code beside the figure.
            netAmountCurrency: 'USD',
        })
    })

    it('accepts both the bare array and the `results` envelope', () => {
        const row = { id: '1', net_amount: 1 }
        expect(normalizePayoutRequests([row])).toHaveLength(1)
        expect(normalizePayoutRequests({ results: [row] })).toHaveLength(1)
        // Anything else is an empty page, never a thrown render.
        for (const body of [null, undefined, 'nope', 42, {}, { results: 'nope' }]) {
            expect(normalizePayoutRequests(body)).toEqual([])
        }
    })

    it('keeps a row whose optional fields are missing', () => {
        const [row] = normalizePayoutRequests([{ id: '7' }])
        // A payout the reader cannot see because a field was absent is worse than a sparse row.
        expect(row).toEqual({
            id: '7',
            requestNumber: '',
            status: '',
            createdAt: 0,
            netAmount: null,
            netAmountCurrency: '',
        })
    })

    it('keeps a row carrying fields this client has not been told about', () => {
        // `looseObject`: a new key must not fail the row.
        const [row] = normalizePayoutRequests([
            { id: '8', net_amount: '5.00', settlement_rail: 'swift' },
        ])
        expect(row.id).toBe('8')
        expect(row.netAmount).toBe(5)
    })

    it('drops only the malformed row, not the page', () => {
        const rows = normalizePayoutRequests([
            { id: '1', net_amount: '1.00' },
            // No `id` — nothing can key or link this row, so it cannot be shown.
            { net_amount: '2.00' },
            { id: '3', net_amount: '3.00' },
        ])
        expect(rows.map(row => row.id)).toEqual(['1', '3'])
    })

    it('reports an unreadable amount as unknown, not as zero', () => {
        /*
         * Every one of these is a figure billy did not give us, including an object — which must not
         * cost the reader the whole row. `null` reaches the row as `—`; `0` would tell a creator they
         * were paid nothing, and `NaN` would render as "NaN USD".
         */
        for (const net_amount of ['', 'abc', null, undefined, {}, [], Number.NaN, true]) {
            const [row] = normalizePayoutRequests([{ id: '1', net_amount }])
            expect(row, JSON.stringify(net_amount)).toBeDefined()
            expect(row.netAmount).toBeNull()
        }
        const [negative] = normalizePayoutRequests([{ id: '1', net_amount: '-12.5' }])
        // A reversal is a real row and keeps its sign.
        expect(negative.netAmount).toBe(-12.5)
    })

    it('never turns an unreadable date into `NaN`', () => {
        // `NaN` reaches `ledgerMonthKey`, and an "Invalid Date" month header is unrecoverable.
        for (const created_at of ['', 'not a date', null]) {
            const [row] = normalizePayoutRequests([{ id: '1', created_at }])
            expect(row.createdAt).toBe(0)
        }
    })
})

/**
 * The live response, verbatim, because a hand-written fixture is exactly what let this ship broken.
 *
 * The first version of the schema declared `created_at: z.string()`. This endpoint sends epoch
 * **milliseconds as a number**, so every row failed `safeParse`, `normalizePayoutRequests` returned
 * `[]`, and the screen said *"No payouts yet"* over three real payout requests — a silent, total
 * failure that every unit test of the time passed. Anything trimmed from this literal is a shape the
 * tests stop covering, so it is kept whole.
 */
const LIVE_RESPONSE = {
    count: 3,
    next: null,
    previous: null,
    results: [
        {
            id: 'pr_Ae8boJ4GXvnyV',
            request_number: '3083471133',
            amount: '100.00',
            amount_currency: 'TEVI',
            net_amount: '89.00',
            net_amount_currency: 'USDT',
            fee: '11.00',
            fee_currency: 'TEVI',
            fee_details: [
                {
                    type: 'payout_fee',
                    original: null,
                    platform: null,
                    subtotal: { amount: '5.00', currency: 'TEVI' },
                    flat_fee_amount: '0.0',
                    percent_fee_rate: '5.0',
                },
            ],
            status: 'waiting',
            payout_config: 'po_BYJ4wDNO39xXa',
            payout_option: 'saving',
            exchange_rate: '1.0000000000',
            created_at: 1780291984000,
            pending_at: null,
            on_hold_at: null,
            completed_at: null,
            failed_at: null,
            fail_reason: null,
        },
        {
            id: 'pr_279g32LVXwNak',
            request_number: '72485111495',
            amount: '1000.00',
            amount_currency: 'TEVI',
            net_amount: '23034486.00',
            net_amount_currency: 'VND',
            fee: '101.00',
            fee_currency: 'TEVI',
            fee_details: [],
            status: 'waiting',
            payout_config: 'po_e8RnoXR8vPKZJ',
            payout_option: 'saving',
            exchange_rate: '25622.3426000000',
            created_at: 1780291228000,
            pending_at: null,
            on_hold_at: null,
            completed_at: null,
            failed_at: null,
            fail_reason: null,
        },
    ],
}

describe('the live response', () => {
    it('reads every row', () => {
        // The regression: this returned `[]`.
        const { rows } = normalizePayoutRequestPage(LIVE_RESPONSE)
        expect(rows).toHaveLength(2)
        expect(rows.map(row => row.id)).toEqual(['pr_Ae8boJ4GXvnyV', 'pr_279g32LVXwNak'])
    })

    it('reads `created_at` as epoch milliseconds, not as a date string', () => {
        const [row] = normalizePayoutRequestPage(LIVE_RESPONSE).rows
        expect(row.createdAt).toBe(1780291984000)
    })

    it('keeps the fields it uses and ignores the eleven it does not', () => {
        const [row] = normalizePayoutRequestPage(LIVE_RESPONSE).rows
        expect(row).toEqual({
            id: 'pr_Ae8boJ4GXvnyV',
            requestNumber: '3083471133',
            status: 'waiting',
            createdAt: 1780291984000,
            // The **net** figure and its own currency, which is not `amount_currency` — the request is
            // in TEVI and settles in USDT, and the row states what reaches the bank.
            netAmount: 89,
            netAmountCurrency: 'USDT',
        })
    })

    it('reads `next` rather than inferring from a full page', () => {
        // Two rows against a page size of 20 would also imply "no more"; the point is that this list
        // does not have to imply anything, because the endpoint says so.
        expect(normalizePayoutRequestPage(LIVE_RESPONSE).hasMore).toBe(false)
        expect(
            normalizePayoutRequestPage({ ...LIVE_RESPONSE, next: 'https://…/?page=2' }).hasMore,
        ).toBe(true)
        // An empty string is not a URL.
        expect(normalizePayoutRequestPage({ results: [], next: '' }).hasMore).toBe(false)
        expect(normalizePayoutRequestPage(null).hasMore).toBe(false)
    })

    it('handles a settlement currency with no minor unit', () => {
        // VND. The row prints `23,034,486.00 VND`, which is not how anybody writes dong — see the
        // note on `formatAmountWithCode`. The parse is right; the formatting is the open question.
        const row = normalizePayoutRequestPage(LIVE_RESPONSE).rows[1]
        expect(row.netAmount).toBe(23034486)
        expect(row.netAmountCurrency).toBe('VND')
    })
})
