import { describe, expect, it } from 'vitest'
import type { Gateway } from '../api/types'
import {
    formatCharge,
    gatewayAccepts,
    gatewayFeeCharge,
    gatewayFeeUsd,
    gatewayRatePerStar,
    gatewayTotal,
    isSymbolFirst,
    USD_CURRENCY_ID,
} from './gateway-fee'

function gateway(overrides: Partial<Gateway> = {}): Gateway {
    return {
        id: 'gw.stripe',
        name: 'Card',
        images: [],
        fee_percent_rate: 2.9,
        fee_flat_amount: 0.3,
        currency: { id: USD_CURRENCY_ID, usd_conversion_rate: 1, min_unit: 0.01 },
        min_payment_amount: 0,
        max_payment_amount: null,
        ...overrides,
    } as Gateway
}

describe('gatewayFeeUsd', () => {
    it('reads the rate as a percentage, plus the flat component', () => {
        // 9.99 × 2.9% = 0.28971 → 0.29, + 0.30
        expect(gatewayFeeUsd(9.99, gateway())).toBe(0.59)
    })

    it('is 0 for a gateway that charges nothing, and null when there is no gateway', () => {
        expect(gatewayFeeUsd(9.99, gateway({ fee_percent_rate: 0, fee_flat_amount: 0 }))).toBe(0)
        expect(gatewayFeeUsd(9.99, null)).toBeNull()
        expect(gatewayFeeUsd(Number.NaN, gateway())).toBeNull()
        expect(gatewayFeeUsd(-1, gateway())).toBeNull()
    })
})

describe('gatewayTotal', () => {
    it('adds the fee and keeps two decimals, with no floating-point dust', () => {
        expect(gatewayTotal(9.99, gateway())).toEqual({
            amount: 10.58,
            currencyId: USD_CURRENCY_ID,
            converted: true,
        })
    })

    it('converts and rounds to the gateway min unit', () => {
        const vnd = gateway({
            fee_percent_rate: 0,
            fee_flat_amount: 0,
            currency: { id: 'VND', usd_conversion_rate: 25_413, min_unit: 1000 },
        })
        // 9.99 × 25,413 = 253,875.87 → rounded to the nearest 1,000
        expect(gatewayTotal(9.99, vnd)).toEqual({
            amount: 254_000,
            currencyId: 'VND',
            converted: true,
        })
    })

    it('stays in USD when the conversion is unknown — and says so instead of mislabelling it', () => {
        const unknown = gateway({ currency: { id: 'VND', usd_conversion_rate: 0, min_unit: 0 } })
        expect(gatewayTotal(9.99, unknown)).toEqual({
            amount: 10.58,
            currencyId: USD_CURRENCY_ID,
            converted: false,
        })
    })

    it('has no total without a gateway', () => {
        expect(gatewayTotal(9.99, null)).toBeNull()
        expect(gatewayTotal(9.99, undefined)).toBeNull()
    })
})

describe('gatewayRatePerStar', () => {
    it('prices a Star through 100 of them, so a large min unit cannot swallow the rate', () => {
        const vnd = gateway({
            fee_percent_rate: 0,
            fee_flat_amount: 0,
            currency: { id: 'VND', usd_conversion_rate: 25_000, min_unit: 1000 },
        })
        // $1 → 25,000 VND → ÷100
        expect(gatewayRatePerStar(vnd)).toMatchObject({ amount: 250, currencyId: 'VND' })
    })

    it('includes the fee, amortised — which is why the line is labelled ≈', () => {
        // $1 + 2.9% + $0.30 = $1.33 → 0.0133 per Star
        expect(gatewayRatePerStar(gateway())?.amount).toBe(0.0133)
    })

    it('is null without a gateway', () => {
        expect(gatewayRatePerStar(null)).toBeNull()
    })
})

describe('isSymbolFirst', () => {
    it('puts `$` before the number and a code after it', () => {
        expect(isSymbolFirst({ amount: 1, currencyId: '$', converted: false })).toBe(true)
        expect(isSymbolFirst({ amount: 1, currencyId: '', converted: false })).toBe(true)
        expect(isSymbolFirst({ amount: 1, currencyId: 'VND', converted: true })).toBe(false)
    })
})

describe('against a real response', () => {
    /**
     * The `gw.stripe` row from a live settle response, and the total the backend charged for it. This
     * is the only test here whose numbers are not invented — it pins that the client's arithmetic is
     * the backend's, rather than merely self-consistent.
     *
     * ```json
     * { "payment_method": { "fee_flat_amount": "0.60", "fee_percent_rate": "25.00",
     *                       "currency": null, "min_payment_amount": "0.00" },
     *   "amount": "1.38", "amount_currency": "USD" }
     * ```
     */
    const LIVE = gateway({
        name: 'Credit or Debit Card (USD)',
        fee_percent_rate: 25,
        fee_flat_amount: 0.6,
        currency: null,
    })

    it('reproduces the amount the backend charged', () => {
        // 0.62 + 25% + 0.60 → 1.375, and both sides round the same way.
        expect(gatewayTotal(0.62, LIVE)).toEqual({
            amount: 1.38,
            currencyId: USD_CURRENCY_ID,
            converted: false,
        })
    })

    it('a `null` currency keeps the figure in USD and says so', () => {
        // Not a defensive branch: this is what a live card gateway actually sends.
        expect(gatewayTotal(9.99, LIVE)?.converted).toBe(false)
        expect(gatewayTotal(9.99, LIVE)?.currencyId).toBe(USD_CURRENCY_ID)
    })
})

describe('gatewayAccepts', () => {
    it('takes anything when the band is open — `0` floor, `null` ceiling', () => {
        expect(gatewayAccepts(0.99, gateway())).toBe(true)
        expect(gatewayAccepts(9999, gateway())).toBe(true)
    })

    it('refuses below the floor and above the ceiling', () => {
        const banded = gateway({ min_payment_amount: 5, max_payment_amount: 100 })
        expect(gatewayAccepts(4.99, banded)).toBe(false)
        expect(gatewayAccepts(5, banded)).toBe(true)
        expect(gatewayAccepts(100, banded)).toBe(true)
        expect(gatewayAccepts(100.01, banded)).toBe(false)
    })

    it('reads a `0` maximum as no ceiling, not as "nothing may be paid"', () => {
        expect(gatewayAccepts(50, gateway({ max_payment_amount: 0 }))).toBe(true)
    })

    it('has no opinion without a gateway or a price', () => {
        expect(gatewayAccepts(10, null)).toBe(false)
        expect(gatewayAccepts(0, gateway())).toBe(false)
    })
})

describe('formatCharge', () => {
    it('puts a symbol in front with two decimals, and a code behind with none forced', () => {
        expect(formatCharge({ amount: 10.29, currencyId: '$', converted: false })).toBe('$10.29')
        expect(formatCharge({ amount: 250000, currencyId: 'VND', converted: true })).toBe(
            '250000 VND',
        )
    })

    it('falls back to the dollar sign when the payload carries no currency id', () => {
        // `isSymbolFirst` already treats `''` as USD; this pins that the *printed* string agrees.
        expect(formatCharge({ amount: 1.5, currencyId: '', converted: false })).toBe('$1.50')
    })

    it('prints an em dash for no charge — nothing chosen is not a price of zero', () => {
        expect(formatCharge(null)).toBe('—')
    })
})

describe('gatewayFeeCharge', () => {
    it('answers in the charged currency, not in dollars', () => {
        // 15% on $3.00 = $0.45; at 26,953.33 ₫ and a 500 ₫ unit both sides round the same way.
        const row = gateway({
            fee_percent_rate: 15,
            fee_flat_amount: 0,
            currency: { id: 'VND', usd_conversion_rate: 26953.3327, min_unit: 500 },
        })
        const fee = gatewayFeeCharge(3, row)
        expect(fee?.currencyId).toBe('VND')
        expect(fee?.converted).toBe(true)
        // The difference between the two rounded figures — not a separately converted $0.45.
        const total = gatewayTotal(3, row)
        const bare = gatewayTotal(3, { ...row, fee_percent_rate: 0, fee_flat_amount: 0 })
        expect(fee?.amount).toBe((total?.amount ?? 0) - (bare?.amount ?? 0))
    })

    it('is the plain USD fee when the gateway prices in dollars', () => {
        const fee = gatewayFeeCharge(3, gateway({ fee_percent_rate: 45, fee_flat_amount: 0 }))
        expect(fee).toEqual({ amount: 1.35, currencyId: USD_CURRENCY_ID, converted: true })
    })

    it('stays in USD when the gateway declared no conversion at all', () => {
        const fee = gatewayFeeCharge(
            3,
            gateway({ fee_percent_rate: 45, fee_flat_amount: 0, currency: null }),
        )
        expect(fee).toEqual({ amount: 1.35, currencyId: USD_CURRENCY_ID, converted: false })
    })

    it('is zero — not null — for a gateway that charges nothing', () => {
        expect(
            gatewayFeeCharge(3, gateway({ fee_percent_rate: 0, fee_flat_amount: 0 }))?.amount,
        ).toBe(0)
    })

    it('is null with no gateway to ask', () => {
        expect(gatewayFeeCharge(3, null)).toBeNull()
    })
})
