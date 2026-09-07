import { describe, expect, it } from 'vitest'
import type { PremiumPackage } from '../api/types'
import { GIFT_PLAN_ORDER, giftMonthlyEquivalent, giftPlanOf, groupGiftPlans } from './gift-plans'

/**
 * The discount on these cards is **a claim about money** that this client computes and prints beside
 * a price, so the cases worth pinning are the ones that would make it a lie. Legacy renders `-35%`
 * and `-10%` as literals in JSX against prices that come from the API — every one of these tests is
 * a way that goes wrong the day a price moves, with nothing failing.
 */

function pkg(over: Partial<PremiumPackage> = {}): PremiumPackage {
    return {
        id: '1',
        product_id: 'price_1',
        price: 10,
        currency: 'USD',
        duration_days: 90,
        is_active: true,
        sort_order: 1,
        ...over,
    }
}

describe('giftPlanOf', () => {
    it('reads the three durations the catalogue sells', () => {
        expect(giftPlanOf(pkg({ duration_days: 90 }))).toBe('quarter')
        expect(giftPlanOf(pkg({ duration_days: 180 }))).toBe('half')
        expect(giftPlanOf(pkg({ duration_days: 365 }))).toBe('year')
    })

    it('is null for a duration no card can label', () => {
        // Dropped rather than drawn with a made-up heading — including the *subscription*
        // catalogue's own cadences, which is what makes the two tables genuinely separate.
        for (const days of [7, 30, 100, 0]) {
            expect(giftPlanOf(pkg({ duration_days: days }))).toBeNull()
        }
    })
})

describe('groupGiftPlans', () => {
    it('indexes by duration and leaves an unoffered one null', () => {
        const grouped = groupGiftPlans([pkg({ duration_days: 365, id: 'y' })])
        expect(grouped.year?.id).toBe('y')
        expect(grouped.quarter).toBeNull()
    })

    it('takes the first of two rows with the same duration', () => {
        // A catalogue mistake, not a choice being offered: rendering both would put two year cards
        // on the screen, and picking the cheaper would undercut whatever the backoffice meant.
        const grouped = groupGiftPlans([
            pkg({ duration_days: 365, id: 'first', price: 90 }),
            pkg({ duration_days: 365, id: 'second', price: 80 }),
        ])
        expect(grouped.year?.id).toBe('first')
    })
})

describe('the catalogue has no discount to print', () => {
    /**
     * The finding this screen's second line exists because of, kept executable.
     *
     * The three live prices are one rate — the widest gap between any two is **1.4%**, and that is
     * only the year being 365 days rather than 360 — so no formula can produce the `-35%` and `-10%`
     * legacy prints. `-35%` turned out to be **`/premium`'s** number ($77.92 against 12 × $9.99),
     * copy-pasted onto a $99.99 card where the real saving against the monthly subscription is 17%.
     *
     * So the cards print `giftMonthlyEquivalent` instead: the rate, derived from the total directly
     * above it. This test is what stops a percentage coming back without a source.
     */
    it('prices all three tiers at one rate', () => {
        const perDay = (price: number, days: number) => price / days
        const rates = [perDay(24.99, 90), perDay(49.99, 180), perDay(99.99, 365)]
        const spread = (Math.max(...rates) - Math.min(...rates)) / Math.max(...rates)

        expect(spread).toBeLessThan(0.02)
        // Nowhere near either figure legacy printed.
        expect(Math.round(spread * 100)).not.toBe(10)
        expect(Math.round(spread * 100)).not.toBe(35)
    })
})

describe('giftMonthlyEquivalent', () => {
    it('divides by the package’s own months, not by a calendar', () => {
        // The catalogue prices "3 months" at 90 days, so the same approximation is the honest one.
        expect(giftMonthlyEquivalent(pkg({ duration_days: 90, price: 30 }))).toBe(10)
        expect(giftMonthlyEquivalent(pkg({ duration_days: 180, price: 54 }))).toBe(9)
    })

    it('does not divide by zero for an unusable duration', () => {
        expect(giftMonthlyEquivalent(pkg({ duration_days: 0, price: 30 }))).toBe(30)
    })
})

describe('GIFT_PLAN_ORDER', () => {
    it('puts the recommendation in the middle', () => {
        // Legacy's own left-to-right order, and it is why the year card is the second thing read
        // when the three stack below `md` rather than the last.
        expect(GIFT_PLAN_ORDER).toEqual(['quarter', 'year', 'half'])
    })
})
