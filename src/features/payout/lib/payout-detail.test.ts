import { describe, expect, it } from 'vitest'
import { normalizePayoutRequestDetail, type PayoutRequestDetail } from '../api/types'
import { formatPayoutEtaRange, payoutEta } from './payout-eta'
import { payoutFeeLines, payoutSubReceive } from './payout-fees'
import { payoutTimeline } from './payout-timeline'

/**
 * The detail screen accounts for the gap between what a creator asked for and what arrived, so what is
 * pinned here is the arithmetic and the two places it can lie:
 *
 * - a fee is quoted in **TEVI** and shown in the settlement currency, so it is converted — and without
 *   a rate it must **not** be converted by 1, which on a VND payout is wrong by four orders of magnitude;
 * - a **waived** fee keeps its stated rate and charges nothing, so the row can say "1 + 5%" and "Free";
 * - the timeline is built from **timestamps**, so a step with no timestamp does not exist;
 * - `payout_option` and `payout_config` change shape between the list and the detail.
 */

/** The live list payload's own numbers, extended with the fields only the detail sends. */
const DETAIL = {
    id: 'pr_279g32LVXwNak',
    request_number: '72485111495',
    amount: '1000.00',
    amount_currency: 'TEVI',
    net_amount: '23034486.00',
    net_amount_currency: 'VND',
    fee: '101.00',
    fee_currency: 'TEVI',
    fee_details: [
        {
            type: 'payout_fee',
            original: null,
            subtotal: { amount: '50.00', currency: 'TEVI' },
            flat_fee_amount: '0.0',
            percent_fee_rate: '5.0',
        },
        {
            type: 'payout_transaction_fee',
            original: null,
            subtotal: { amount: '51.00', currency: 'TEVI' },
            flat_fee_amount: '1.00',
            percent_fee_rate: '5.00',
        },
    ],
    status: 'waiting',
    /*
     * The live payload's own shapes, kept as they arrive: `payout_duration` is a **number** here (the
     * list's string form is covered separately), the method carries a logo / currency /
     * `processing_time_note`, and `payout_detail` sends **`bank` and `bank_name` with the same value**.
     */
    payout_option: {
        id: 'saving',
        flat_fee_amount: '0.00',
        percent_fee_rate: '0.00',
        metadata: { payout_duration: 15 },
        is_active: true,
    },
    payout_config: {
        id: 'po_e8RnoXR8vPKZJ',
        payout_method: {
            id: 'pm_LpOmAv74341Bz',
            name: 'Bank Transfer 24/7',
            slug: 'bank_transfer',
            logo: 'https://static.tevi.com/payments/payout_methods/bank_transfer.png',
            currency: 'VND',
            // The **method's** rate — what everything on the screen is computed with.
            exchange_rate: '25457.6849',
            country: { alpha_2: 'VN', name: 'Viet Nam', allow_payout: true },
            processing_time_note: '1 business day',
            fee_flat_amount: '1.00',
            fee_percent_rate: '5.00',
        },
        payout_detail: {
            bank: 'TPB - NH TMCP Tiên Phong',
            bank_name: 'TPB - NH TMCP Tiên Phong',
            holder_name: 'Sinh',
            account_number: '123456789',
            // Empty and non-string values are dropped rather than rendered as blank rows.
            zipcode: '',
            corp_name: null,
        },
        contact_name: 'SinhPn',
        contact_email: 'sinh@tevi.com',
        status: 'active',
    },
    exchange_rate: '25622.3426000000',
    created_at: 1780291228000,
    pending_at: null,
    on_hold_at: null,
    completed_at: null,
    failed_at: null,
    fail_reason: null,
}

function read(over: Record<string, unknown> = {}): PayoutRequestDetail {
    const parsed = normalizePayoutRequestDetail({ ...DETAIL, ...over })
    if (!parsed) throw new Error('expected the payload to parse')
    return parsed
}

describe('normalizePayoutRequestDetail', () => {
    it('reads the detail payload', () => {
        const request = read()
        expect(request.amount).toBe(1000)
        // `TEVI` on the wire, **`USD`** on screen: legacy maps it explicitly, because TEVI is the
        // internal name of the dollar-denominated earnings balance and no creator has seen the word.
        expect(request.amountCurrency).toBe('USD')
        expect(request.netAmount).toBe(23034486)
        expect(request.netAmountCurrency).toBe('VND')
        expect(request.fee).toBe(101)
        expect(request.exchangeRate).toBeCloseTo(25622.3426)
        expect(request.option).toBe('saving')
        expect(request.optionDuration).toBe(15)
    })

    it('accepts the shapes the **list** sends for the same two fields', () => {
        // In the list `payout_option` is `"saving"` and `payout_config` is the id `"po_…"`. A client
        // that only handles the detail's object form breaks on whichever endpoint it saw second.
        const request = read({ payout_option: 'fast', payout_config: 'po_e8RnoXR8vPKZJ' })
        expect(request.option).toBe('fast')
        expect(request.optionDuration).toBeNull()
        expect(request.config).toBeNull()
    })

    it('reads the method, including the fields the first pass ignored', () => {
        const request = read()
        expect(request.config).toMatchObject({
            methodName: 'Bank Transfer 24/7',
            methodCurrency: 'VND',
            countryName: 'Viet Nam',
            processingTimeNote: '1 business day',
        })
        // A backend-decided URL, which is the documented exception to "no remote images".
        expect(request.config?.methodLogo).toContain('static.tevi.com')
    })

    it('keeps only the config fields that carry a value', () => {
        const request = read()
        expect(request.config?.detail).toEqual({
            // `bank` and `bank_name` both arrive with the same value. Both are parsed; the *row list*
            // is what drops the duplicate, because legacy renders only the keys it knows.
            bank: 'TPB - NH TMCP Tiên Phong',
            bank_name: 'TPB - NH TMCP Tiên Phong',
            holder_name: 'Sinh',
            account_number: '123456789',
        })
        expect(request.config?.detail.zipcode).toBeUndefined()
        expect(request.config?.detail.corp_name).toBeUndefined()
    })

    it('is `null` for a body that is not a payout', () => {
        // The screen is *about* one request, so an unreadable body is a not-found rather than a page
        // of blanks. The list's parser keeps the page and drops the row; here there is nothing to keep.
        for (const body of [null, undefined, 'nope', 42, {}, { results: [] }]) {
            expect(normalizePayoutRequestDetail(body)).toBeNull()
        }
    })
})

describe('payoutFeeLines', () => {
    it('converts each charge with the **method** rate, not the request rate', () => {
        const [withdraw, transaction] = payoutFeeLines(read())
        /*
         * `payout_method.exchange_rate` is 25457.6849 and the request's root `exchange_rate` is
         * 25622.3426 — two different numbers, and legacy computes with the first
         * (`roundToTwo(parseFloat(payout_method.exchange_rate))` → 25457.68). Using the root rate here
         * printed `-1,281,117.13` where legacy's own screen reads `-1,272,884.00`. Verified against a
         * screenshot of the live app.
         */
        expect(withdraw.convertedCharge).toBeCloseTo(50 * 25457.68, 2)
        expect(withdraw.convertedCharge).toBeCloseTo(1272884, 2)
        expect(transaction.convertedCharge).toBeCloseTo(51 * 25457.68, 2)
    })

    it('computes the sub-receive figure from the same rate', () => {
        // `amount × methodRate` — the gross in the settlement currency, before fees. Legacy's own row,
        // and 1000 × 25457.68 = 25,457,680, which is what its screen shows.
        expect(payoutSubReceive(read())).toBeCloseTo(25457680, 2)
        expect(payoutSubReceive(read({ payout_config: 'po_x' }))).toBeNull()
    })

    it('does not convert by 1 when there is no rate', () => {
        const [withdraw] = payoutFeeLines(
            read({
                payout_config: {
                    ...DETAIL.payout_config,
                    payout_method: { ...DETAIL.payout_config.payout_method, exchange_rate: null },
                },
            }),
        )
        // `null`, so the row falls back to the raw figure **with its own code**. A rate of 1 would print
        // `50 VND` for a 1,281,117 VND fee.
        expect(withdraw.convertedCharge).toBeNull()
        expect(withdraw.rawCharge).toBe(50)
    })

    it('states the rate from `original` when the fee was waived', () => {
        const lines = payoutFeeLines(
            read({
                fee_details: [
                    {
                        type: 'payout_fee',
                        // Charged nothing, but the rate that was waived is still 1 + 5%.
                        original: { flat_fee_amount: '1.00', percent_fee_rate: '5.00' },
                        subtotal: { amount: '0.00', currency: 'TEVI' },
                        flat_fee_amount: '0.0',
                        percent_fee_rate: '0.0',
                    },
                ],
            }),
        )
        expect(lines[0].isWaived).toBe(true)
        expect(lines[0].flatAmount).toBe(1)
        expect(lines[0].percentRate).toBe(5)
        // Showing `0%` here would say the fee does not exist rather than that it was waived.
        expect(lines[0].hasNoRate).toBe(false)
    })

    it('flags a fee that states no rate at all', () => {
        const lines = payoutFeeLines(
            read({
                fee_details: [
                    {
                        type: 'payout_fee',
                        subtotal: { amount: '5.00', currency: 'TEVI' },
                        flat_fee_amount: '0',
                        percent_fee_rate: '0',
                    },
                ],
            }),
        )
        // The caller prints `---`, as legacy does.
        expect(lines[0].hasNoRate).toBe(true)
    })
})

describe('payoutTimeline', () => {
    it('lists only the steps that have a timestamp', () => {
        // A request still waiting has been through nothing else.
        const steps = payoutTimeline(read())
        expect(steps.map(step => step.status)).toEqual(['waiting', 'submitted'])
    })

    it('is newest first and marks the current step', () => {
        const steps = payoutTimeline(
            read({
                status: 'completed',
                pending_at: 1780291300000,
                completed_at: 1780291900000,
            }),
        )
        expect(steps.map(step => step.status)).toEqual([
            'completed',
            'pending',
            'waiting',
            'submitted',
        ])
        // Exactly one current step, and it is the one matching `status` — legacy renders that as plain
        // text and the rest as chips, so "here is where it got to" is readable at a glance.
        expect(steps.filter(step => step.isCurrent).map(step => step.status)).toEqual(['completed'])
    })

    it('never marks the submitted line as current', () => {
        // It is not a status; it is the event the rest of the timeline hangs off.
        const steps = payoutTimeline(read({ status: 'submitted' }))
        expect(steps.at(-1)?.status).toBe('submitted')
        expect(steps.at(-1)?.isCurrent).toBe(false)
    })

    it('is empty when the request has no timestamps at all', () => {
        const steps = payoutTimeline(read({ created_at: null }))
        expect(steps).toEqual([])
    })
})

describe('payoutEta', () => {
    it('gives a saving payout a date window from its duration', () => {
        const request = read()
        const eta = payoutEta(request)
        // `created_at + 15d` to `+ 16d` — legacy's `addDays(d)` to `addDays(d + 1)`. A window, not a
        // point: nobody can name the hour a bank credits an account.
        expect(eta).toEqual({
            kind: 'range',
            fromMs: request.createdAt + 15 * 86_400_000,
            toMs: request.createdAt + 16 * 86_400_000,
        })
    })

    it('gives a fast payout hours', () => {
        const eta = payoutEta(
            read({ payout_option: { id: 'fast', metadata: { payout_duration: 2 } } }),
        )
        // Days × 24, which is legacy's arithmetic — a fast payout is a countdown, not a date.
        expect(eta).toEqual({ kind: 'hours', hours: 48 })
    })

    it('falls back to legacy’s own defaults when no duration is stated', () => {
        const saving = payoutEta(read({ payout_option: { id: 'saving' } }))
        const fast = payoutEta(read({ payout_option: { id: 'fast' } }))
        // 15 days and 1 day. A promise of "about two weeks" beats saying nothing.
        expect(saving).toMatchObject({ kind: 'range' })
        expect(fast).toEqual({ kind: 'hours', hours: 24 })
    })

    it('is `null` when there is nothing to compute from', () => {
        // The caller then omits the row rather than printing a blank, which would read as "unknown".
        expect(payoutEta(read({ created_at: null }))).toBeNull()
        expect(payoutEta(read({ payout_option: 'escrow' }))).toBeNull()
    })

    it('formats the window with `Intl`, collapsing what the locale shares', () => {
        const from = Date.UTC(2025, 1, 27, 12)
        const to = Date.UTC(2025, 1, 28, 12)
        const en = formatPayoutEtaRange(from, to, 'en')
        expect(en).toMatch(/Feb/)
        expect(en).toMatch(/2025/)
        // An unsupported tag must not throw on a screen about somebody's money.
        expect(() => formatPayoutEtaRange(from, to, 'not-a-locale')).not.toThrow()
    })
})
