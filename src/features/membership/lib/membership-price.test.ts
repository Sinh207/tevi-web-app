import { describe, expect, it } from 'vitest'
import { membershipPrice, STAR_PER_USD } from './membership-price'

describe('membershipPrice', () => {
    it('reads a Star-priced row and derives the cash figure', () => {
        expect(membershipPrice(500, 'TVS')).toEqual({ star: 500, usd: 5 })
    })

    it('reads a cash-priced row and derives the Star figure', () => {
        expect(membershipPrice(5, 'USD')).toEqual({ star: 500, usd: 5 })
    })

    /** The wire is inconsistent about currency case — see `currencyText` and B44. */
    it('accepts a lower-cased or padded currency', () => {
        expect(membershipPrice(500, ' tvs ')).toEqual({ star: 500, usd: 5 })
        expect(membershipPrice(5, 'usd')).toEqual({ star: 500, usd: 5 })
    })

    /**
     * The whole reason this returns `null` rather than legacy's `0`: a row whose price could not be
     * read must print nothing, not "0 Star ($0)". A reader checking what a renewal costs would
     * otherwise be told it is free.
     */
    it('refuses to invent a price', () => {
        expect(membershipPrice(0, 'TVS')).toBeNull()
        expect(membershipPrice(null, 'TVS')).toBeNull()
        expect(membershipPrice(undefined, 'USD')).toBeNull()
        expect(membershipPrice(Number.NaN, 'USD')).toBeNull()
        expect(membershipPrice(-5, 'USD')).toBeNull()
    })

    /**
     * A third currency is not converted at the Star rate. Doing so would make one of the two printed
     * figures a fabrication — and it is the kind of wrong that looks right, because the number is
     * plausible.
     */
    it('refuses a currency it has no rate for', () => {
        expect(membershipPrice(100, 'VND')).toBeNull()
        expect(membershipPrice(100, null)).toBeNull()
        expect(membershipPrice(100, '')).toBeNull()
    })

    it('states the rate once', () => {
        expect(STAR_PER_USD).toBe(100)
    })
})
