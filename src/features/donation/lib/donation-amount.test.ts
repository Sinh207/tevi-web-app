import { describe, expect, it } from 'vitest'
import { directDonateSchema } from '../api/types'
import {
    amountFromQuantity,
    canDonate,
    chargedTotal,
    DEFAULT_STAR_UNIT,
    donationFee,
    hasPrice,
    hasStarPrice,
    quantityFromAmount,
    starUnitPrice,
    toNumber,
    unitPrice,
} from './donation-amount'

function offer(prices: { amount: unknown; amount_currency: unknown }[]) {
    return directDonateSchema.parse({ prices })
}

describe('toNumber', () => {
    it('reads a decimal string', () => {
        expect(toNumber('12.5')).toBe(12.5)
    })

    it('answers 0 for the states a field is in while it is being typed into', () => {
        // Every one of these is a real value of a controlled <input type="number">.
        for (const value of ['', '-', '.', 'abc', null, undefined, Number.NaN]) {
            expect(toNumber(value as string)).toBe(0)
        }
    })

    it('never answers NaN, so a comparison downstream cannot silently pass', () => {
        expect(Number.isNaN(toNumber('nonsense'))).toBe(false)
    })
})

describe('starUnitPrice', () => {
    it('selects by currency, not by position', () => {
        expect(
            starUnitPrice(
                offer([
                    { amount: '1.00', amount_currency: 'USD' },
                    { amount: '250', amount_currency: 'TVS' },
                ]),
            ),
        ).toBe(250)
    })

    it('accepts the lower-case spelling the wire is not consistent about', () => {
        expect(starUnitPrice(offer([{ amount: 70, amount_currency: 'tvs' }]))).toBe(70)
    })

    it('falls back when there is no Star line at all', () => {
        expect(starUnitPrice(offer([{ amount: '1.00', amount_currency: 'USD' }]))).toBe(
            DEFAULT_STAR_UNIT,
        )
        expect(starUnitPrice(null)).toBe(DEFAULT_STAR_UNIT)
    })

    it('refuses a zero unit — it would divide by zero and price the offer at nothing', () => {
        expect(starUnitPrice(offer([{ amount: 0, amount_currency: 'TVS' }]))).toBe(
            DEFAULT_STAR_UNIT,
        )
    })
})

describe('hasStarPrice', () => {
    it('is false for a cash-only offer, which is what hides the button', () => {
        expect(hasStarPrice(offer([{ amount: '5.00', amount_currency: 'USD' }]))).toBe(false)
        expect(hasStarPrice(offer([{ amount: 100, amount_currency: 'TVS' }]))).toBe(true)
        expect(hasStarPrice(null)).toBe(false)
    })
})

describe('quantity ↔ amount', () => {
    it('multiplies up from the stepper', () => {
        expect(amountFromQuantity(3, 100)).toBe(300)
        expect(amountFromQuantity('3', 100)).toBe(300)
    })

    it('does not concatenate a raw field string', () => {
        // The bug the whole raw-string discipline exists for: '3' + 100 is '3100'.
        expect(amountFromQuantity('3', 100)).not.toBe(3100)
    })

    it('floors down from a typed amount, so the counter lags rather than the money rounding up', () => {
        expect(quantityFromAmount(250, 100)).toBe(2)
        expect(quantityFromAmount('99', 100)).toBe(0)
    })

    it('survives a zero unit rather than answering Infinity', () => {
        expect(quantityFromAmount(500, 0)).toBe(0)
    })
})

describe('canDonate', () => {
    it('enforces the minimum the field advertises', () => {
        /*
         * The field prints "Enter at least 250 Star". With the old `> 0` rule, typing `1` cleared that
         * message, enabled the button and posted `tvs_amount: 1` for a 250-Star offer.
         */
        expect(canDonate(1, 250)).toBe(false)
        expect(canDonate(249, 250)).toBe(false)
        expect(canDonate(250, 250)).toBe(true)
        expect(canDonate(500, 250)).toBe(true)
    })

    it('falls back to "any positive amount" when the offer has no usable unit price', () => {
        expect(canDonate(1, 0)).toBe(true)
        expect(canDonate(0, 0)).toBe(false)
    })

    it('needs a positive amount', () => {
        expect(canDonate(100)).toBe(true)
        expect(canDonate('100')).toBe(true)
        expect(canDonate(0)).toBe(false)
        expect(canDonate('')).toBe(false)
        expect(canDonate('-50')).toBe(false)
    })
})

describe('the two currencies', () => {
    const both = offer([
        { amount: '1.00', amount_currency: 'USD' },
        { amount: '250', amount_currency: 'TVS' },
    ])

    it('prices each option from its own line', () => {
        expect(unitPrice(both, 'star')).toBe(250)
        expect(unitPrice(both, 'cash')).toBe(1)
    })

    it('answers which options the creator actually offered', () => {
        expect(hasPrice(both, 'star')).toBe(true)
        expect(hasPrice(both, 'cash')).toBe(true)

        const starOnly = offer([{ amount: 100, amount_currency: 'TVS' }])
        // Not `unitPrice(...) > 0` — that is always true because of the fallback. This is what
        // decides whether the Cash tab is offered at all.
        expect(hasPrice(starOnly, 'cash')).toBe(false)
        expect(unitPrice(starOnly, 'cash')).toBe(1)
    })

    it('rounds a cash total to two places rather than shipping binary dust', () => {
        // 3 × 1.1 is 3.3000000000000003 in floating point, and that is what would reach the field
        // and then the request body.
        expect(amountFromQuantity(3, 1.1)).toBe(3.3)
        expect(amountFromQuantity(7, 0.35)).toBe(2.45)
    })

    it('leaves whole Star amounts untouched by that rounding', () => {
        expect(amountFromQuantity(9, 250)).toBe(2250)
    })
})

describe('the card fee', () => {
    /**
     * 2.9% + $0.30, grossed up — the shape a card processor bills at.
     *
     * `x` is the **rate**, so `0.029`. An earlier version of this test used `x: 1` and asserted the
     * result was the fee, which quietly turned a 2.9% charge into a 100% one — a $1 coffee costing
     * $2.34. It looked right because the arithmetic ran and produced a plausible number, which is
     * the whole reason a money formula gets a test with a worked example rather than a smoke check.
     */
    const COEFFICIENTS = { x: 0.029, y: 0.3, z: 0.971 }

    it('applies legacy’s formula', () => {
        // (0.029 × 10 + 0.3) / 0.971 = 0.6076… → 0.61
        expect(donationFee(10, COEFFICIENTS)).toBe(0.61)
    })

    it('grosses up so the creator receives the amount that was chosen', () => {
        // The processor takes its cut of the *total*, so the fee has to be computed from the total
        // rather than from the donation: 2.9% of 10.61 + 0.30 = 0.6077, which is the fee itself.
        const fee = donationFee(10, COEFFICIENTS)
        const total = chargedTotal(10, fee)
        expect(total).toBe(10.61)
        expect(Math.round((total * 0.029 + 0.3) * 100) / 100).toBe(fee)
    })

    it('stays a small fraction of the donation, not a multiple of it', () => {
        const fee = donationFee(100, COEFFICIENTS)
        expect(fee).toBeGreaterThan(0)
        expect(fee).toBeLessThan(100 * 0.1)
    })

    it('answers null when the service has not, rather than claiming the fee is zero', () => {
        expect(donationFee(10, null)).toBeNull()
        // `z` is a divisor: zero makes the formula meaningless, not free.
        expect(donationFee(10, { x: 1, y: 0.3, z: 0 })).toBeNull()
    })

    it('falls back to the donation alone when the fee is unknown', () => {
        expect(chargedTotal(10, null)).toBe(10)
    })

    it('never reports a negative fee', () => {
        expect(donationFee(1, { x: -100, y: 0, z: 1 })).toBe(0)
    })

    it('reads a half-typed amount as nothing rather than NaN', () => {
        // Just the flat component: (0.029 × 0 + 0.3) / 0.971 = 0.309 → 0.31.
        expect(donationFee('', COEFFICIENTS)).toBe(0.31)
        expect(Number.isNaN(chargedTotal('', 0.31))).toBe(false)
    })
})
