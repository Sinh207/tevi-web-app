import { describe, expect, it } from 'vitest'
import { earningsCategoryRows, REVENUE_CATEGORIES } from './revenue-categories'

describe('earningsCategoryRows', () => {
    /**
     * The order is the design, not the payload's. A payload-ordered list puts Membership above
     * Direct donation on the days membership happened to earn more, and the reader has to re-find
     * every line each time they open a row.
     */
    it('renders in the fixed order regardless of the order it was sent', () => {
        expect(
            earningsCategoryRows([
                { category: 'post', revenue: 1 },
                { category: 'direct_donation', revenue: 2 },
                { category: 'membership', revenue: 3 },
            ]).map(row => row.key),
        ).toEqual(['direct_donation', 'membership', 'post'])
    })

    /** Nine rows of `$0.00` under a day that earned from one of them is a wall that hides the
     *  line the reader opened the row to see. */
    it('drops a category that earned nothing', () => {
        expect(
            earningsCategoryRows([
                { category: 'post', revenue: 0 },
                { category: 'membership', revenue: 3 },
            ]).map(row => row.key),
        ).toEqual(['membership'])
    })

    /**
     * **The arithmetic guard.** Legacy drops a category it does not know, so the rows quietly stop
     * adding up to the header the moment the backend adds a revenue type — on a screen whose whole
     * job is to explain that total. Folded into `other` rather than listed by slug, because a raw
     * `space_tier_bonus` among translated labels is not copy.
     */
    it('folds an unknown category into `other` rather than losing it', () => {
        const rows = earningsCategoryRows([
            { category: 'space_tier_bonus', revenue: 4 },
            { category: 'affiliate', revenue: 1 },
            { category: 'other', revenue: 2 },
        ])
        expect(rows).toHaveLength(1)
        expect(rows[0].key).toBe('other')
        expect(rows[0].revenue).toBe(7)
    })

    it('sums repeats of the same category', () => {
        const rows = earningsCategoryRows([
            { category: 'post', revenue: 1.5 },
            { category: 'post', revenue: 2.5 },
        ])
        expect(rows).toEqual([{ key: 'post', label: 'earnings_category_post', revenue: 4 }])
    })

    it('is empty for a day with nothing to show', () => {
        expect(earningsCategoryRows([])).toEqual([])
    })
})

describe('REVENUE_CATEGORIES', () => {
    /** Both are keyed on: `key` against the payload, `label` against the translation files. */
    it('has a unique key and a namespaced label for every category', () => {
        const keys = REVENUE_CATEGORIES.map(category => category.key)
        expect(new Set(keys).size).toBe(keys.length)
        for (const category of REVENUE_CATEGORIES) {
            expect(category.label).toBe(`earnings_category_${category.key}`)
        }
    })
})
