import { describe, expect, it } from 'vitest'
import {
    payoutAmountError,
    payoutAmountPayload,
    payoutMaxAmount,
    payoutSuggestedAmount,
} from './payout-amount'

describe('payoutMaxAmount', () => {
    it('takes the lesser of the balance and the daily allowance', () => {
        expect(payoutMaxAmount(500, 1000)).toBe(500)
        expect(payoutMaxAmount(2000, 1000)).toBe(1000)
        expect(payoutMaxAmount(1000, 1000)).toBe(1000)
    })

    /**
     * `0` blocks the form, and that is the safe direction: a method with no allowance left cannot take a
     * withdrawal, and letting one through would show the reader a server error instead of a limit.
     */
    it('is zero when either side is missing or spent', () => {
        expect(payoutMaxAmount(500, null)).toBe(0)
        expect(payoutMaxAmount(500, 0)).toBe(0)
        expect(payoutMaxAmount(0, 1000)).toBe(0)
        expect(payoutMaxAmount(-5, 1000)).toBe(0)
    })
})

describe('payoutAmountError', () => {
    const MAX = 1000

    it('allows a figure inside the range', () => {
        expect(payoutAmountError(500, MAX)).toBeNull()
        expect(payoutAmountError(10, MAX)).toBeNull()
        expect(payoutAmountError(1000, MAX)).toBeNull()
    })

    /**
     * The **order** is the point of these three. The same `0` satisfies "required", "negative" and
     * "below minimum", and the messages are not equally useful — an empty field must not be told it is
     * below the minimum.
     */
    it('reports an empty field as required, not as below the minimum', () => {
        expect(payoutAmountError(null, MAX)?.key).toBe('payout_request_amount_required')
        expect(payoutAmountError(0, MAX)?.key).toBe('payout_request_amount_required')
        expect(payoutAmountError(Number.NaN, MAX)?.key).toBe('payout_request_amount_required')
    })

    it('reports a negative figure as negative, not as below the minimum', () => {
        expect(payoutAmountError(-50, MAX)?.key).toBe('payout_request_amount_negative')
    })

    it('carries the limit alongside the key, for interpolation', () => {
        expect(payoutAmountError(5, MAX)).toEqual({ key: 'payout_request_amount_min', limit: 10 })
        expect(payoutAmountError(5000, MAX)).toEqual({
            key: 'payout_request_amount_max',
            limit: 1000,
        })
    })

    /** A zero ceiling makes every figure invalid — see `payoutMaxAmount`. */
    it('rejects everything when the ceiling is zero', () => {
        expect(payoutAmountError(50, 0)?.key).toBe('payout_request_amount_max')
    })
})

describe('payoutSuggestedAmount', () => {
    /** A creator opening this screen almost always wants to withdraw what they have. */
    it('offers the largest allowed figure', () => {
        expect(payoutSuggestedAmount(500, 1000)).toBe(500)
        expect(payoutSuggestedAmount(2000, 1000)).toBe(1000)
    })

    /** `null`, not `0` — so the field is cleared rather than filled with a figure to delete. */
    it('offers nothing when nothing is allowed', () => {
        expect(payoutSuggestedAmount(500, null)).toBeNull()
        expect(payoutSuggestedAmount(0, 1000)).toBeNull()
    })
})

describe('payoutMaxAmount — the two-decimal floor', () => {
    /**
     * **The ceiling has to be expressible in two decimals**, because two decimals is what is sent.
     *
     * A balance of `4400.035` used to make **Max** fill the field with `4400.035`: valid (it *is* the
     * ceiling) and then sent as `"4400.04"` — a request for a cent more than the account holds, refused
     * by the server with a message the reader cannot act on, because the field shows a figure that looks
     * right.
     */
    it('floors the ceiling rather than rounding it', () => {
        expect(payoutMaxAmount(4400.035, 5000)).toBe(4400.03)
        expect(payoutMaxAmount(5000, 999.999)).toBe(999.99)
    })

    it('leaves a two-decimal figure alone', () => {
        expect(payoutMaxAmount(4400.03, 5000)).toBe(4400.03)
    })
})

describe('payoutAmountPayload', () => {
    /**
     * A **string**, because the schema types `amount` as `decimal`. Handing the server whatever
     * `JSON.stringify` makes of a float is not a detail on money.
     */
    it('sends two decimals as a string', () => {
        expect(payoutAmountPayload(1000)).toBe('1000.00')
        expect(payoutAmountPayload(10.5)).toBe('10.50')
        expect(payoutAmountPayload(0.1 + 0.2)).toBe('0.30')
    })

    /**
     * **Floor, never round.** `toFixed(2)` rounds half-up, so `4400.035` left as `"4400.04"` — a cent
     * more than the reader typed, and at the ceiling a cent more than they have. A cent stops being a
     * rounding detail when the server's answer is "insufficient balance".
     */
    it('floors rather than rounding up', () => {
        expect(payoutAmountPayload(4400.035)).toBe('4400.03')
        expect(payoutAmountPayload(10.999)).toBe('10.99')
        expect(payoutAmountPayload(0.005)).toBe('0.00')
    })
})
