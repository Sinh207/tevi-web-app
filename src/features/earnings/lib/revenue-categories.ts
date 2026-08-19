import type { EarningsCategoryAmount } from '../api/types'

/**
 * The revenue categories a day can be split into, in the order they are shown.
 *
 * ## The order is the design, not the payload's
 *
 * Legacy renders this fixed list and looks each category up in the response
 * (`REVENUE_CATEGORIES.map(… getRevenue(key) …)`), rather than rendering what the API sent. That
 * is worth keeping and worth saying why: the split is a **breakdown of one number**, so it reads
 * as a statement only if the rows are in the same order every day. A payload-ordered list puts
 * Membership above Direct donation on Tuesday because Tuesday's membership revenue was larger,
 * and the reader has to re-find every line each time they expand a row.
 *
 * The order itself is legacy's, which is the order the mobile apps show.
 *
 * ## `label` is a translation key, and three of them have no translation anywhere
 *
 * `live_guest`, `commission` and `other` are `null` in **every** legacy locale file including
 * English — the keys were reserved and never filled. They resolve to the English fallback here
 * for the same reason they do there: the alternative is a money row with a blank label. Flagged
 * for copy rather than papered over.
 */
export interface RevenueCategory {
    /** The backend's slug, matched against `EarningsCategoryAmount.category`. */
    key: string
    /** `{module}_{slug}` translation key. */
    label: string
}

export const REVENUE_CATEGORIES: readonly RevenueCategory[] = [
    { key: 'direct_donation', label: 'earnings_category_direct_donation' },
    { key: 'interaction', label: 'earnings_category_interaction' },
    { key: 'interactive_live', label: 'earnings_category_interactive_live' },
    { key: 'membership', label: 'earnings_category_membership' },
    { key: 'live_stream', label: 'earnings_category_live_stream' },
    { key: 'post', label: 'earnings_category_post' },
    { key: 'live_guest', label: 'earnings_category_live_guest' },
    { key: 'commission', label: 'earnings_category_commission' },
    { key: 'other', label: 'earnings_category_other' },
] as const

/** A category row as the panel renders it: a label key and an amount. */
export interface EarningsCategoryRow extends RevenueCategory {
    revenue: number
}

/**
 * The rows to draw for one day, in the fixed order above.
 *
 * ## Two rules, and each of them is a decision rather than a filter
 *
 * **A category the day did not earn from is not shown.** Legacy's `getRevenue` returns `null`
 * when the response has no entry for a key and the row is skipped, and that is right: nine rows
 * of `$0.00` under a day that earned from one of them is a wall of noise that hides the line the
 * reader opened the row to see. A category present in the payload with a genuine `0` is treated
 * the same way — it says the same thing.
 *
 * **A category the backend sends that this list does not know about is still shown**, under the
 * `other` label, rather than silently dropped. Legacy drops it, and the consequence is that the
 * day's rows quietly stop adding up to the day's total the moment the backend adds a revenue
 * type — on a screen whose entire job is to explain a total. B31 asks for the closed set; until
 * there is one, an unknown category is a real possibility and this is what keeps the arithmetic
 * honest. They are folded into a single `other` row rather than listed by slug, because a raw
 * `space_tier_bonus` in the middle of translated labels is not copy.
 */
export function earningsCategoryRows(details: EarningsCategoryAmount[]): EarningsCategoryRow[] {
    const byCategory = new Map<string, number>()
    for (const detail of details) {
        byCategory.set(detail.category, (byCategory.get(detail.category) ?? 0) + detail.revenue)
    }

    const known = new Set(REVENUE_CATEGORIES.map(category => category.key))
    let unknownTotal = 0
    for (const [category, revenue] of byCategory) {
        if (!known.has(category)) unknownTotal += revenue
    }

    const rows: EarningsCategoryRow[] = []
    for (const category of REVENUE_CATEGORIES) {
        const revenue =
            (byCategory.get(category.key) ?? 0) + (category.key === 'other' ? unknownTotal : 0)
        if (revenue === 0) continue
        rows.push({ ...category, revenue })
    }
    return rows
}
