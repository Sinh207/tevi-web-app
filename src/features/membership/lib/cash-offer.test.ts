import { describe, expect, it } from 'vitest'
import { membershipPackageSchema } from '../api/types'
import { cashOffer } from './cash-offer'
import { membershipChargedTotal, membershipFee } from './membership-fee'

/** Parsed rather than hand-built: the resolver reads what the schema produces, not what we hope it does. */
function pkg(raw: unknown) {
    return membershipPackageSchema.parse(raw)
}

const USD = { id: 'price_usd', amount: '5.00', amount_currency: 'usd' }
const TVS = { id: 'price_tvs', amount: 500, amount_currency: 'TVS' }

describe('cashOffer', () => {
    it('resolves the USD line, its fee and its total', () => {
        const offer = cashOffer(
            pkg({ id: '9', name: 'Gold', description: 'Hi', prices: [TVS, USD] }),
        )
        expect(offer).toEqual({
            packageId: '9',
            name: 'Gold',
            description: 'Hi',
            priceId: 'price_usd',
            price: { id: 'price_usd', amount: 5, amount_currency: 'USD' },
            usd: 5,
            fee: membershipFee(5),
            total: membershipChargedTotal(5),
        })
    })

    /** `amount_currency` is lower-cased on the wire in places (B44); the schema upper-cases it. */
    it('matches the currency after normalisation, and by value not by position', () => {
        const offer = cashOffer(pkg({ id: '1', prices: [USD, TVS] }))
        expect(offer?.priceId).toBe('price_usd')
    })

    it('is null for a Star-only tier', () => {
        expect(cashOffer(pkg({ id: '1', prices: [TVS] }))).toBeNull()
    })

    /**
     * A price with an amount and no id can be shown but not charged. Returning it would produce a
     * checkout button that 400s — the failure `joinOffer` documents on the other currency.
     */
    it('is null for a USD line with no price id', () => {
        expect(
            cashOffer(pkg({ id: '1', prices: [{ amount: 5, amount_currency: 'USD' }] })),
        ).toBeNull()
    })

    it('is null for a non-positive amount', () => {
        expect(
            cashOffer(pkg({ id: '1', prices: [{ id: 'p', amount: 0, amount_currency: 'USD' }] })),
        ).toBeNull()
    })

    it('is null without a package id', () => {
        expect(cashOffer(pkg({ prices: [USD] }))).toBeNull()
        expect(cashOffer(null)).toBeNull()
        expect(cashOffer(undefined)).toBeNull()
    })

    /**
     * Legacy's own crash: `prices?.findIndex(...)` yields `undefined` when `prices` is absent,
     * `undefined !== -1` passes, and the next line indexes `undefined`. A `find` cannot reach it, and
     * this is the payload that used to.
     */
    it('is null — not a throw — for a payload carrying no prices at all', () => {
        expect(cashOffer(pkg({ id: '1' }))).toBeNull()
        expect(cashOffer(pkg({ id: '1', prices: 'nope' }))).toBeNull()
    })
})
