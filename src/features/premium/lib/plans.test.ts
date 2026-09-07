import en from '@shared/i18n/locales/en/translation.json'
import { describe, expect, it } from 'vitest'
import type { PremiumPackage } from '../api/types'
import {
    groupPlans,
    monthlyEquivalent,
    PLAN_COPY,
    PLAN_ORDER,
    planOf,
    savingsPercent,
    yearAtMonthlyPrice,
} from './plans'

const pkg = (duration_days: number, price: number, product_id = `price_${duration_days}`) =>
    ({ id: String(duration_days), product_id, price, duration_days }) as PremiumPackage

describe('planOf', () => {
    it('names the three cadences the product sells', () => {
        expect(planOf(pkg(7, 1))).toBe('weekly')
        expect(planOf(pkg(30, 5))).toBe('monthly')
        expect(planOf(pkg(365, 49))).toBe('annual')
    })

    /** A cadence with no card is dropped, never labelled with the nearest heading. */
    it('answers null for a cadence the screen cannot label', () => {
        expect(planOf(pkg(90, 15))).toBeNull()
        expect(planOf(pkg(0, 15))).toBeNull()
    })
})

describe('groupPlans', () => {
    it('indexes the packages by plan and reports the missing ones', () => {
        const plans = groupPlans([pkg(365, 49), pkg(7, 1.99)])
        expect(plans.annual?.price).toBe(49)
        expect(plans.weekly?.price).toBe(1.99)
        expect(plans.monthly).toBeNull()
    })

    /** A duplicated cadence is a catalogue mistake; the payload's order decides, not the price. */
    it('keeps the first of two packages with the same duration', () => {
        const plans = groupPlans([pkg(30, 5, 'price_a'), pkg(30, 3, 'price_b')])
        expect(plans.monthly?.product_id).toBe('price_a')
    })

    it('drops a cadence it has no card for', () => {
        expect(groupPlans([pkg(90, 12)])).toEqual({ weekly: null, monthly: null, annual: null })
    })
})

describe('savingsPercent', () => {
    it('is the discount against twelve monthly payments, rounded', () => {
        // 12 × 5.99 = 71.88 against 49 → 31.8%
        expect(savingsPercent(groupPlans([pkg(365, 49), pkg(30, 5.99)]))).toBe(32)
    })

    it('is null when there is no monthly price to compare against', () => {
        expect(savingsPercent(groupPlans([pkg(365, 49)]))).toBeNull()
    })

    /**
     * The case that makes it a lie. Legacy prints `-0% off billed annually` for both of these —
     * a discount line on a plan that is not a discount.
     */
    it('is null when the annual plan is not actually cheaper', () => {
        expect(savingsPercent(groupPlans([pkg(365, 60), pkg(30, 5)]))).toBeNull()
        expect(savingsPercent(groupPlans([pkg(365, 60), pkg(30, 5.01)]))).toBeNull()
    })

    it('is null rather than Infinity when the monthly price is unusable', () => {
        const plans = { ...groupPlans([pkg(365, 49)]), monthly: pkg(30, 0) }
        expect(savingsPercent(plans)).toBeNull()
    })
})

describe('the figures on the annual card', () => {
    it('divides the year by twelve without rounding it', () => {
        // 49/12 is 4.0833…; rounding here would round twice, once without the currency's minor unit.
        expect(monthlyEquivalent(pkg(365, 49))).toBeCloseTo(4.0833, 4)
    })

    it('prices a year of monthly payments', () => {
        expect(yearAtMonthlyPrice(pkg(30, 5.99))).toBeCloseTo(71.88, 2)
    })
})

describe('PLAN_COPY', () => {
    it('covers every plan in the display order', () => {
        expect([...PLAN_ORDER].sort()).toEqual(Object.keys(PLAN_COPY).sort())
    })

    /**
     * The cards read these through `t(variable)`, which `shared/i18n/keys.test.ts` cannot see — it
     * only resolves **literal** keys, and a key that exists nowhere renders as its own name on the
     * screen (`premium_tier_legend` where "Legend Mode" belongs, in every locale at once). So the
     * existence check that file performs for every other key in the app happens here for these
     * twelve.
     */
    it.each([...PLAN_ORDER])('%s names keys that exist in English', plan => {
        for (const key of Object.values(PLAN_COPY[plan])) {
            expect(Object.keys(en), key).toContain(key)
        }
    })

    it('puts the recommended plan in the middle', () => {
        expect(PLAN_ORDER).toEqual(['weekly', 'annual', 'monthly'])
    })
})
