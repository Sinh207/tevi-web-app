import { describe, expect, it } from 'vitest'
import { normalizePayoutOptions, normalizePayoutQuote } from './payout-request-api'

/**
 * Parsed against the **live payloads** supplied 2026-08-28. Three of the assertions below cover things
 * this client was getting wrong, and none of the three would have shown up as an error.
 */

/** `payout-options/`, verbatim. Note `fast` is **`is_active: false`**. */
const LIVE_OPTIONS = {
    count: 2,
    next: null,
    previous: null,
    results: [
        {
            id: 'saving',
            flat_fee_amount: '0.00',
            percent_fee_rate: '0.00',
            metadata: { payout_duration: 15 },
            is_active: true,
        },
        {
            id: 'fast',
            flat_fee_amount: '0.00',
            percent_fee_rate: '5.00',
            metadata: { payout_duration: 1 },
            is_active: false,
        },
    ],
}

/** `payout/quote/`, verbatim — including `expires_at` and the `original` / `platform` nulls. */
const LIVE_QUOTE = {
    id: 'pq_O5BDv9JZk3d9R',
    payout_config: 'po_BYJ4wDNO39xXa',
    payout_option: 'saving',
    amount: '5000.00',
    amount_currency: 'TEVI',
    fee: '501.00',
    fee_currency: 'TEVI',
    fee_details: [
        {
            type: 'payout_fee',
            flat_fee_amount: '0.0',
            percent_fee_rate: '5.0',
            original: null,
            platform: null,
            subtotal: { amount: '250.00', currency: 'TEVI' },
        },
        {
            type: 'payout_transaction_fee',
            flat_fee_amount: '1.00',
            percent_fee_rate: '5.00',
            original: null,
            platform: null,
            subtotal: { amount: '251.00', currency: 'TEVI' },
        },
    ],
    net_amount: '4499.00',
    net_amount_currency: 'USDT',
    exchange_rate: '1.0000000000',
    expires_at: 1_787_904_535_000,
    created_at: 1_787_904_235_000,
}

describe('normalizePayoutOptions — against the live payload', () => {
    /**
     * `is_active` is on the wire and was being ignored — the live payload has `fast` `false`.
     *
     * ⚠ It is **not** a reason to hide the card. The flag means the speed is not open to *this account*,
     * not that the platform switched it off, so the card is drawn, marked *Only for Premium users*, and
     * the press raises the upsell. Parsing it is what lets `PayoutOptionCards` tell selecting from
     * selling; filtering on it was my first, wrong reading.
     */
    it('reads is_active, which the live payload has false on fast', () => {
        const [saving, fast] = normalizePayoutOptions(LIVE_OPTIONS)
        expect(saving).toMatchObject({ id: 'saving', isActive: true, durationDays: 15 })
        expect(fast).toMatchObject({ id: 'fast', isActive: false, durationDays: 1 })
    })

    /** Absent ⇒ active: a payload that stops sending the flag must not empty the picker. */
    it('treats a missing is_active as active', () => {
        const [option] = normalizePayoutOptions({ results: [{ id: 'saving' }] })
        expect(option.isActive).toBe(true)
    })

    /** `"0.00"` — a string, and zero, which is what makes the Saving card read `Free`. */
    it('parses the string rates', () => {
        const [saving, fast] = normalizePayoutOptions(LIVE_OPTIONS)
        expect(saving.percentFeeRate).toBe(0)
        expect(fast.percentFeeRate).toBe(5)
    })
})

describe('normalizePayoutQuote — against the live payload', () => {
    it('reads the net, its currency, and the fee lines', () => {
        const quote = normalizePayoutQuote(LIVE_QUOTE)
        expect(quote).toMatchObject({
            id: 'pq_O5BDv9JZk3d9R',
            netAmount: 4499,
            netAmountCurrency: 'USDT',
            fee: 501,
            exchangeRate: 1,
        })
        expect(quote?.fees.payout_fee).toMatchObject({ subtotal: 250, percentFeeRate: 5 })
        expect(quote?.fees.payout_transaction_fee).toMatchObject({
            subtotal: 251,
            flatFeeAmount: 1,
            percentFeeRate: 5,
        })
    })

    /**
     * **The quote expires**, and this client was not reading the field. 300 seconds past `created_at` on
     * the live payload — so a reader who left the tab open would submit a `quote_id` the server has
     * already dropped, and find out from a 4xx.
     */
    it('reads expires_at, five minutes past creation', () => {
        const quote = normalizePayoutQuote(LIVE_QUOTE)
        expect(quote?.expiresAt).toBe(1_787_904_535_000)
        expect((quote?.expiresAt as number) - LIVE_QUOTE.created_at).toBe(300_000)
    })

    /** No `expires_at` ⇒ `null`, i.e. treated as not expiring — the behaviour before the field existed. */
    it('reads a missing expiry as null', () => {
        const quote = normalizePayoutQuote({ id: 'q', net_amount: '1' })
        expect(quote?.expiresAt).toBeNull()
    })

    /**
     * `net_amount_currency` is **USDT** while `amount_currency` is **TEVI** — two units on one quote, so
     * the net must never be labelled with the amount's currency.
     */
    it('keeps the net in its own currency rather than the amount currency', () => {
        const quote = normalizePayoutQuote(LIVE_QUOTE)
        expect(quote?.netAmountCurrency).toBe('USDT')
        expect(quote?.fees.payout_fee?.subtotalCurrency).toBe('TEVI')
    })

    it('survives a payload it does not recognise', () => {
        expect(normalizePayoutQuote(null)).toBeNull()
        expect(normalizePayoutQuote({})).toMatchObject({ netAmount: null })
    })
})

describe('normalizePayoutQuote — a waived fee', () => {
    /**
     * **The waiver is expressed by nesting, not by a flag.** When a fee is free the top level holds the
     * charged figures (zero) and `original` holds what it would have been — so `Boolean(original)` is
     * the whole test, which is exactly legacy's `isFree`.
     *
     * This screen had none of it: it printed every fee as a live charge, so a waived one showed the
     * pre-waiver amount as a deduction and the block stopped adding up — `net_amount` already reflects
     * the waiver, so *sub-receive − fees* came out below *receive*.
     */
    const waived = {
        id: 'q-free',
        amount: '100.00',
        amount_currency: 'TEVI',
        net_amount: '100.00',
        net_amount_currency: 'USD',
        exchange_rate: '1',
        fee_details: [
            {
                type: 'payout_transaction_fee',
                // What was actually taken: nothing.
                subtotal: { amount: '0', currency: 'TEVI' },
                flat_fee_amount: '0',
                percent_fee_rate: '0',
                // What it would have been.
                original: {
                    subtotal: { amount: '1.50', currency: 'TEVI' },
                    flat_fee_amount: '1',
                    percent_fee_rate: '0.5',
                },
            },
        ],
    }

    it('reads the pre-waiver figures and marks the fee waived', () => {
        const fee = normalizePayoutQuote(waived)?.fees.payout_transaction_fee
        expect(fee?.isWaived).toBe(true)
        // The *rate* still stands — it is what tells a creator what was waived.
        expect(fee?.flatFeeAmount).toBe(1)
        expect(fee?.percentFeeRate).toBe(0.5)
        // And the figure shown is the one that would have been charged, not the zero that was.
        expect(fee?.subtotal).toBe(1.5)
        expect(fee?.subtotalCurrency).toBe('TEVI')
    })

    /** No `original` ⇒ charged, and the top-level figures are the ones shown. */
    it('leaves an ordinary fee alone', () => {
        const quote = normalizePayoutQuote({
            ...waived,
            fee_details: [
                {
                    type: 'payout_transaction_fee',
                    subtotal: { amount: '1.50', currency: 'TEVI' },
                    flat_fee_amount: '1',
                    percent_fee_rate: '0.5',
                },
            ],
        })
        const fee = quote?.fees.payout_transaction_fee
        expect(fee?.isWaived).toBe(false)
        expect(fee?.subtotal).toBe(1.5)
    })

    /** `null` is not a waiver — the field being present but empty must not strike a live charge out. */
    it('treats an explicit null original as not waived', () => {
        const quote = normalizePayoutQuote({
            ...waived,
            fee_details: [
                {
                    type: 'payout_fee',
                    subtotal: { amount: '2.00', currency: 'TEVI' },
                    flat_fee_amount: '2',
                    percent_fee_rate: '0',
                    original: null,
                },
            ],
        })
        expect(quote?.fees.payout_fee.isWaived).toBe(false)
        expect(quote?.fees.payout_fee.subtotal).toBe(2)
    })

    /**
     * **`??`, not `||`, on the subtotal.** A genuinely-zero `original.subtotal` is a real value, and
     * `||` would fall through to the charged figure — printing the wrong number struck through. Legacy
     * uses `||` at all seven of its call sites and only gets away with it because a waived fee's
     * original is never zero in practice; that is a property of the data, not of the code.
     */
    it('keeps a zero original subtotal instead of falling through', () => {
        const quote = normalizePayoutQuote({
            ...waived,
            fee_details: [
                {
                    type: 'payout_fee',
                    subtotal: { amount: '9.99', currency: 'TEVI' },
                    flat_fee_amount: '0',
                    percent_fee_rate: '0',
                    original: {
                        subtotal: { amount: '0', currency: 'TEVI' },
                        flat_fee_amount: '0',
                        percent_fee_rate: '0',
                    },
                },
            ],
        })
        expect(quote?.fees.payout_fee.isWaived).toBe(true)
        expect(quote?.fees.payout_fee.subtotal).toBe(0)
    })
})
