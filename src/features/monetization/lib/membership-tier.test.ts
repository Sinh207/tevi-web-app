import { describe, expect, it } from 'vitest'
import type { MyPackage } from '../api/types'
import {
    MEMBERSHIP_PRICE_LADDER,
    matchPriceRung,
    memberPrice,
    priceIn,
    pricesPayload,
    starPriceOf,
} from './membership-tier'

function pkg(prices: { amount: number; amount_currency: string }[]): MyPackage {
    return {
        id: 'pkg-1',
        name: 'Inner circle',
        description: null,
        sharable_url: null,
        prices: prices.map(price => ({ id: null, ...price })),
    } as MyPackage
}

describe('membership price ladder', () => {
    it('is legacy’s five rungs, at legacy’s rate', () => {
        expect(MEMBERSHIP_PRICE_LADDER.map(r => [r.usd, r.stars])).toEqual([
            [2, 200],
            [5, 500],
            [10, 1000],
            [15, 1500],
            [20, 2000],
        ])
    })

    /** Legacy's own note: the API caps a package at 2000 Star. A sixth rung must not sail past it. */
    it('stays inside the API’s 2000 Star cap', () => {
        for (const rung of MEMBERSHIP_PRICE_LADDER) expect(rung.stars).toBeLessThanOrEqual(2000)
    })
})

describe('pricesPayload', () => {
    /**
     * The shapes are legacy's, mismatched types included — Star as a **number**, USD as a **string**.
     * Pinned because it is a wire contract that reads like a bug, so the next reader's instinct is to
     * "fix" it, and the failure that produces is a rejected write with no message a screen can show.
     */
    it('writes Star first, as a number, and USD as a string', () => {
        expect(pricesPayload(MEMBERSHIP_PRICE_LADDER[2])).toEqual([
            { amount: 1000, amount_currency: 'TVS' },
            { amount: '10', amount_currency: 'USD' },
        ])
    })
})

describe('reading a saved tier back', () => {
    it('finds the rung by its USD figure', () => {
        expect(
            matchPriceRung(
                pkg([
                    { amount: 1500, amount_currency: 'TVS' },
                    { amount: 15, amount_currency: 'USD' },
                ]),
            ),
        ).toBe(3)
    })

    /**
     * The quiet failure. A tier priced off the ladder used to land on index `0`, so opening the form
     * and pressing Save silently dropped a $12 tier to $2. `-1` is what lets the form refuse to
     * pretend.
     */
    it('reports -1 for a price no rung matches, rather than falling back to the cheapest', () => {
        expect(
            matchPriceRung(
                pkg([
                    { amount: 1200, amount_currency: 'TVS' },
                    { amount: 12, amount_currency: 'USD' },
                ]),
            ),
        ).toBe(-1)
    })

    it('reports -1 when the tier carries no USD price at all', () => {
        expect(matchPriceRung(pkg([{ amount: 500, amount_currency: 'TVS' }]))).toBe(-1)
        expect(matchPriceRung(null)).toBe(-1)
    })

    it('reads the Star figure, and treats a missing one as zero', () => {
        expect(starPriceOf(pkg([{ amount: 500, amount_currency: 'TVS' }]))).toBe(500)
        expect(starPriceOf(pkg([{ amount: 5, amount_currency: 'USD' }]))).toBe(0)
        expect(starPriceOf(null)).toBe(0)
    })

    it('priceIn returns null rather than 0 for an absent currency', () => {
        expect(priceIn(pkg([{ amount: 5, amount_currency: 'USD' }]).prices, 'TVS')).toBeNull()
    })
})

describe('memberPrice', () => {
    /**
     * The bug this function was written for. The row showed a Star figure only for a `TVS` price, so
     * a member paying in cash — which is a real row — got a line with no price on it at all, and the
     * creator could not see what they were being paid.
     */
    it('reads a USD row, which used to render nothing', () => {
        expect(memberPrice(10, 'USD')).toEqual({ star: 1000, usd: 10 })
    })

    it('reads a Star row', () => {
        expect(memberPrice(1000, 'TVS')).toEqual({ star: 1000, usd: 10 })
    })

    it('is case- and whitespace-insensitive about the currency', () => {
        expect(memberPrice(10, ' usd ')).toEqual({ star: 1000, usd: 10 })
    })

    /**
     * `null`, never `0`. Legacy prints `0` and `($0)` for a price it cannot read — a claim about
     * somebody's money, wrong in the direction that matters: a paying member shown as free.
     */
    it.each([
        ['a missing currency', 5, null],
        ['a third currency', 5, 'VND'],
        ['a zero amount', 0, 'TVS'],
        ['a negative amount', -5, 'TVS'],
        ['a missing amount', null, 'TVS'],
    ] as const)('returns null for %s', (_label, amount, currency) => {
        expect(memberPrice(amount, currency)).toBeNull()
    })
})
