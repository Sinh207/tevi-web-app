import { describe, expect, it } from 'vitest'
import { membershipPackageSchema } from '../api/types'
import { firstJoinable, hasCashPrice, joinOffer } from './join-offer'

function pkg(prices: { id?: unknown; amount: unknown; amount_currency: unknown }[], name = 'Gold') {
    return membershipPackageSchema.parse({ id: 'pkg_1', name, description: null, prices })
}

const STAR = { id: 'price_tvs', amount: '500', amount_currency: 'TVS' }
const CASH = { id: 'price_usd', amount: '5', amount_currency: 'USD' }

describe('joinOffer', () => {
    it('reads the Star line by currency, not by position', () => {
        expect(joinOffer(pkg([CASH, STAR]))).toEqual({
            packageId: 'pkg_1',
            name: 'Gold',
            description: null,
            priceId: 'price_tvs',
            stars: 500,
            usd: 5,
            // The cash line's id, which is what starts a card membership.
            cashPriceId: 'price_usd',
        })
    })

    it('refuses a cash-only tier — it would answer with a clientSecret this app cannot use', () => {
        expect(joinOffer(pkg([CASH]))).toBeNull()
    })

    it('refuses a Star line with no id or no price, rather than sending a request that 400s', () => {
        expect(joinOffer(pkg([{ amount: 500, amount_currency: 'TVS' }]))).toBeNull()
        expect(joinOffer(pkg([{ ...STAR, amount: 0 }]))).toBeNull()
    })

    it('answers null for nothing at all', () => {
        expect(joinOffer(null)).toBeNull()
        expect(joinOffer(undefined)).toBeNull()
    })
})

describe('hasCashPrice', () => {
    it('reports the cash line without gating on it', () => {
        expect(hasCashPrice(pkg([STAR, CASH]))).toBe(true)
        expect(hasCashPrice(pkg([STAR]))).toBe(false)
    })
})

describe('firstJoinable', () => {
    it('skips a cash-only tier instead of giving up at it', () => {
        // Legacy takes `packages[0]` outright, so this space would show no button at all.
        const offer = firstJoinable([pkg([CASH], 'Bronze'), pkg([STAR], 'Gold')])
        expect(offer?.name).toBe('Gold')
    })

    it('answers null when no tier can be joined', () => {
        expect(firstJoinable([pkg([CASH])])).toBeNull()
        expect(firstJoinable([])).toBeNull()
    })
})

describe('the cash line', () => {
    it('carries the id a card membership is started with', () => {
        const offer = joinOffer(pkg([STAR, CASH]))
        expect(offer?.usd).toBe(5)
        expect(offer?.cashPriceId).toBe('price_usd')
    })

    it('reports no cash price id when the amount is unusable', () => {
        // A price line with no positive amount is not an offer, whatever id it carries.
        const offer = joinOffer(pkg([STAR, { ...CASH, amount: 0 }]))
        expect(offer?.usd).toBeNull()
        expect(offer?.cashPriceId).toBeNull()
    })

    it('separates "there is a price" from "it can be charged"', () => {
        // A line can carry an amount and no id: enough to show a figure, not enough to charge.
        const offer = joinOffer(pkg([STAR, { amount: 5, amount_currency: 'USD' }]))
        expect(offer?.usd).toBe(5)
        expect(offer?.cashPriceId).toBeNull()
    })
})
