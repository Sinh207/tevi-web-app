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

    /**
     * `id` and `txId` are **different fields on purpose**, and this is the bug that made them so.
     *
     * `id` is the React list key, so it falls back to `type + timestamp` when billy sends none. That
     * fallback then went out over the wire: `/my-wallet` maps these ids into
     * `dapp-wallet/…?billy_tx_id=…` to fetch each row's Tevi Coin bonus (B83), so a row with no id was
     * asking about `platform_earning-1739975520000` — a transaction that does not exist, in a
     * parameter the other service reads as an id list.
     *
     * Nothing broke visibly: the bonus for that row simply never matched, and the query key carried a
     * value no server would recognise. Pinned so the two fields cannot be merged back.
     */
    it('keeps the list-key fallback out of txId', () => {
        const [withId] = normalizeLedger([row])
        expect(withId.id).toBe('t1')
        expect(withId.txId).toBe('t1')

        const [noId] = normalizeLedger([{ ...row, id: undefined }])
        // The list key is still composed, because React needs *something* stable.
        expect(noId.id).toBe(`top_up-${Date.parse('2025-02-19T14:32:00Z')}`)
        // The wire id is not.
        expect(noId.txId).toBeNull()
    })

    /** An empty-string id is the same case — `entrySchema` catches an unreadable one to `''`. */
    it('reads an empty id as no id', () => {
        expect(normalizeLedger([{ ...row, id: '' }])[0].txId).toBeNull()
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

/**
 * The **live `billy/v5/billing/transactions/` payload**, five rows chosen to cover every shape it has
 * been seen to send. Supplied 2026-08-28 and kept verbatim rather than tidied: every claim below was
 * read off it, and three of them are things the shape does not advertise.
 */
const LIVE_LEDGER = [
    {
        id: '0265397a-2895-499d-8140-0eecf7d56d29',
        description: 'Interactive Live Revenue from event "SinhPn\'s Live Event"',
        amount: '0.14',
        amount_currency: 'TEVI',
        net_amount: '0.07',
        net_amount_currency: 'TEVI',
        fee: '0.07',
        fee_currency: 'TEVI',
        fee_details: {
            beauty_fee: {
                amount: '0',
                currency: 'TEVI',
            },
            streaming_fee: {
                amount: '0.07',
                currency: 'TEVI',
            },
            streaming_fee_detail: [
                {
                    type: 'service_fee',
                    subtotal: {
                        amount: '0.07',
                        currency: 'TEVI',
                    },
                    flat_fee_amount: '0',
                    percent_fee_rate: '0.5',
                },
            ],
        },
        type: 'platform_earning',
        status: 'success',
        exchange_rate: '1.0000000000',
        event_code: '02275269',
        bill_detail: {
            revenue: {
                live_chat: {
                    quantity: 11,
                    subtotal: {
                        amount: '0.11',
                        currency: 'TEVI',
                    },
                },
                view_cost: {
                    quantity: 3,
                    subtotal: {
                        amount: '0.03',
                        currency: 'TEVI',
                    },
                },
            },
            commission: {
                mcn: {
                    amount: '0.00',
                    currency: 'TEVI',
                },
                mcn_rate: '0',
            },
            minute_usage: 0,
            ticket_count: 0,
        },
        mcn_id: '25780565-9169-4793-a02c-32e242f4c76c',
        expected_release_at: 1765446856000,
        released_at: 1765446857000,
        updated_at: 1765446857000,
        created_at: 1765446856000,
    },
    {
        id: '69e794b1-9bfc-4ab9-881a-fc37084479ff',
        description: 'Commission from event "SinhPn\'s Live Event"',
        amount: '0.53',
        amount_currency: 'TEVI',
        net_amount: '0.00',
        net_amount_currency: 'TEVI',
        fee: '0.00',
        fee_currency: 'TEVI',
        fee_details: {
            streaming_fee_detail: null,
        },
        type: 'commission',
        status: 'success',
        exchange_rate: '1.0000000000',
        event_code: '02275269',
        bill_detail: null,
        mcn_id: '25780565-9169-4793-a02c-32e242f4c76c',
        expected_release_at: 1765446856000,
        released_at: 1765447208000,
        updated_at: 1765447208000,
        created_at: 1765446856000,
    },
    {
        id: '9b4c65a4-0075-4a05-8885-7798d585dec5',
        description: 'Withdraw to Bank Transfer 24/7 #39233436726',
        amount: '-1000.00',
        amount_currency: 'TEVI',
        net_amount: '23059304.00',
        net_amount_currency: 'VND',
        fee: '101.00',
        fee_currency: 'TEVI',
        fee_details: [
            {
                type: 'payout_fee',
                subtotal: {
                    amount: '50.00',
                    currency: 'TEVI',
                },
                flat_fee_amount: '0.0',
                percent_fee_rate: '5.0',
            },
        ],
        type: 'payout',
        status: 'in_progress',
        exchange_rate: null,
        event_code: null,
        bill_detail: null,
        mcn_id: null,
        expected_release_at: null,
        released_at: null,
        updated_at: 1761973941000,
        created_at: 1761973941000,
    },
    {
        id: '382037d0-2ebb-45fd-b514-2e411eb018a6',
        description: 'Revenue from Post',
        amount: '10.00',
        amount_currency: 'TEVI',
        net_amount: '8.50',
        net_amount_currency: 'TEVI',
        fee: '1.50',
        fee_currency: 'TEVI',
        fee_details: null,
        type: 'platform_earning',
        status: 'success',
        exchange_rate: null,
        event_code: null,
        bill_detail: null,
        mcn_id: null,
        expected_release_at: null,
        released_at: 1762933320000,
        updated_at: 1762933320000,
        created_at: 1762933320000,
    },
    {
        id: '476c11ac-1f3c-4d14-a6a5-f883393aae22',
        description: 'Reward from Lucky Wheel',
        amount: '0.10',
        amount_currency: 'TEVI',
        net_amount: '0.10',
        net_amount_currency: 'TEVI',
        fee: '0.00',
        fee_currency: 'TEVI',
        fee_details: null,
        type: 'reward',
        status: 'success',
        exchange_rate: null,
        event_code: null,
        bill_detail: null,
        mcn_id: null,
        expected_release_at: null,
        released_at: null,
        updated_at: 1760351068000,
        created_at: 1760351068000,
    },
] as const

describe('normalizeLedger — against the live payload', () => {
    /**
     * **There is no `billy_tx_id` and no `bonus` on a billy row.** That closes B83's first question in
     * the direction the answer did not suggest: the product side said the bonus *can* ride on the billy
     * row, but nothing in the live payload carries it yet. So `dapp-wallet/v1/t/transactions/` stays,
     * and this test is what will fail — loudly, in the right place — on the day the field appears.
     */
    it('carries no bonus field yet, so the second lookup is still required', () => {
        for (const row of LIVE_LEDGER) {
            expect(row).not.toHaveProperty('billy_tx_id')
            expect(row).not.toHaveProperty('bonus')
            expect(row).not.toHaveProperty('tevi_coin_amount')
        }
    })

    /** Every row has a real id, so `txId` is never the composed list key on this payload. */
    it('gives every row a real txId', () => {
        const entries = normalizeLedger({ results: LIVE_LEDGER })
        expect(entries).toHaveLength(LIVE_LEDGER.length)
        for (const entry of entries) {
            expect(entry.txId).toBe(entry.id)
            expect(entry.txId).toMatch(/^[0-9a-f-]{36}$/)
        }
    })

    /**
     * **The payout row is the one that would go wrong**, and it is why `EARNING_TYPES` is a closed set
     * rather than "use `net_amount` when present".
     *
     * It carries `amount: "-1000.00"` in **TEVI** and `net_amount: "23059304.00"` in **VND** — two
     * different units on one row. The net is what reached the bank; the movement in the balance is the
     * gross. Showing the net here would report a 1,000 TEVI withdrawal as twenty-three million.
     */
    it('shows the payout row as its TEVI gross, not its VND net', () => {
        const payout = normalizeLedger({ results: LIVE_LEDGER }).find(e => e.type === 'payout')
        expect(payout?.amount).toBe(-1000)
        expect(payout?.currency).toBe('TEVI')
    })

    /**
     * **The unit comes from `amount_currency`.** This is the fault the live payload exposed: the schema
     * read `currency`, which billy does not send on this endpoint, so every non-earning row parsed with
     * no unit — and `formatLedgerAmount`'s `!currency` branch prints a bare number **without
     * converting** it to the reader's display currency.
     *
     * A `reward` of `0.10` TEVI showed as `0.1` on a wallet displaying VND, where it should read
     * `₫2,540`. Nothing threw, no state was empty, and the earning rows — the ones a test reaches for
     * first — were all correct, because they take `net_amount_currency` and the payload does send that.
     */
    it('reads the unit from amount_currency, not from a `currency` billy does not send', () => {
        for (const entry of normalizeLedger({ results: LIVE_LEDGER })) {
            expect(entry.currency).not.toBe('')
        }
        const reward = normalizeLedger({ results: LIVE_LEDGER }).find(e => e.type === 'reward')
        expect(reward?.currency).toBe('TEVI')
    })

    /** `currency` is still accepted, since the Star ledger has not been seen live. */
    it('still accepts a bare `currency`', () => {
        const [entry] = normalizeLedger([
            { id: 'x', type: 'reward', created_at: 1_765_446_856_000, currency: 'tvs', amount: 5 },
        ])
        expect(entry.currency).toBe('TVS')
    })

    /**
     * `platform_earning` and `commission` *do* take the net — legacy's `EARNING_TYPES` — and the live
     * payload shows why each matters: a post's revenue is 10.00 gross / 8.50 net, and a commission is
     * 0.53 gross / **0.00** net.
     *
     * A commission row therefore renders as `0.00`, which reads oddly and is what `web-app` shows. Left
     * as legacy has it; noted here so the next reader does not take it for a parsing fault.
     */
    it('takes the net for an earning and a commission', () => {
        const entries = normalizeLedger({ results: LIVE_LEDGER })
        expect(entries.find(e => e.description === 'Revenue from Post')?.amount).toBe(8.5)
        expect(entries.find(e => e.type === 'commission')?.amount).toBe(0)
    })

    /** A type with no `net_*` at all takes the gross. */
    it('takes the gross for a reward', () => {
        const reward = normalizeLedger({ results: LIVE_LEDGER }).find(e => e.type === 'reward')
        expect(reward?.amount).toBe(0.1)
    })

    /**
     * **`fee_details` has two different shapes on one endpoint**: an *object* on a live earning
     * (`beauty_fee`, `streaming_fee`, `streaming_fee_detail`) and an *array* on a payout. `LedgerEntry`
     * reads neither, so nothing breaks today — stated because a future reader adding a fee breakdown to
     * this screen will otherwise write one parser and find it works on half the rows.
     */
    it('survives both fee_details shapes', () => {
        expect(normalizeLedger({ results: LIVE_LEDGER })).toHaveLength(LIVE_LEDGER.length)
    })

    /** Epoch **milliseconds** here — the opposite unit from the dApp bonus lookup's seconds. */
    it('reads created_at as milliseconds', () => {
        const [first] = normalizeLedger({ results: LIVE_LEDGER })
        expect(first.createdAt).toBe(1_765_446_856_000)
        expect(new Date(first.createdAt).getUTCFullYear()).toBe(2025)
    })

    /**
     * **`status` is on the row and this client ignores it** — including `in_progress` on the payout.
     * So does `web-app`: its ledger sheet hard-codes *"Transaction completed successfully on"* and reads
     * `transaction.status` nowhere (only `withdrawDetail` does). Pinned as a *fact about today*, not an
     * endorsement — see B83's note. Change this test when the product decides the sheet should say what
     * an `in_progress` row actually is.
     */
    it('does not surface the row status, matching legacy', () => {
        const payout = LIVE_LEDGER.find(r => r.type === 'payout')
        expect(payout?.status).toBe('in_progress')
        const entries = normalizeLedger({ results: LIVE_LEDGER })
        expect(entries.find(e => e.type === 'payout')).not.toHaveProperty('status')
    })
})
