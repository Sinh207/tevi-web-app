import type { PremiumPackage } from '../api/types'

/**
 * Turning `premium/v1/gift-packages/` into the three cards `/gift-premium` draws — and the
 * arithmetic printed on them.
 *
 * The sibling of [`plans.ts`](./plans.ts), and deliberately a second module rather than a
 * parameterised one: the two catalogues share a *shape* and nothing else. Subscription cadences are
 * 7/30/365 with a recurring charge and a "Best Value" annual; gift cadences are 90/180/365, bought
 * once, and the discount is claimed against a different baseline. Folding them together would mean
 * a `kind` flag threaded through every function and two disjoint sets of durations behind one union
 * — the shape `docs/DEFINITION_OF_DONE.md` warns about, for the sake of not writing `find` twice.
 *
 * ## `duration_days` is the identity, because it is all there is
 *
 * The payload carries no cadence, no `interval` and no plan name. Legacy matches on 90, 180 and 365
 * and this is a port of that. Anything else is a row **no card can label**, so `giftPlanOf`
 * answering `null` is what makes "dropped" explicit rather than implicit in an `if/else` chain.
 *
 * ## Why the discount is computed here and not read off a component
 *
 * Because it is **a claim about money**. "-25% off billed" is a number this client prints beside a
 * price, so it belongs behind a test rather than inside JSX, and the cases worth pinning are the
 * ones that would make it a lie: no baseline package, a longer plan that is not actually cheaper,
 * and the rounding at the boundary.
 */

/** The three durations the gift catalogue sells, keyed by what the wire says. */
export const GIFT_DURATION_DAYS = {
    quarter: 90,
    half: 180,
    year: 365,
} as const

export type GiftPlan = keyof typeof GIFT_DURATION_DAYS

/**
 * Left to right, as legacy renders them: **3 months, 12 months, 6 months.**
 *
 * The year is in the middle because it is the recommended one — it carries the crown, the gold
 * frame and the violet ground, and the two flanking cards sit lower on desktop so it stands proud
 * of them. Below `md` the three stack in this same order, so the recommendation is the second thing
 * read rather than the last. Same construction, and the same reason, as `PLAN_ORDER`.
 */
export const GIFT_PLAN_ORDER: readonly GiftPlan[] = ['quarter', 'year', 'half'] as const

/** Which plan a package is, or `null` for a duration this screen has no card for. */
export function giftPlanOf(pkg: PremiumPackage): GiftPlan | null {
    for (const plan of GIFT_PLAN_ORDER) {
        if (pkg.duration_days === GIFT_DURATION_DAYS[plan]) return plan
    }
    return null
}

/** The three packages, by plan. A plan the payload did not offer is `null`. */
export type GiftPlans = Record<GiftPlan, PremiumPackage | null>

/**
 * Index the packages by plan.
 *
 * **First match wins.** Two packages with the same `duration_days` is a catalogue mistake rather
 * than a choice being offered: picking the cheaper would quietly undercut whatever the backoffice
 * meant, and rendering both would put two year cards on the screen. The payload's own order
 * decides, which is the one thing the backoffice controls.
 */
export function groupGiftPlans(packages: readonly PremiumPackage[]): GiftPlans {
    const plans: GiftPlans = { quarter: null, half: null, year: null }
    for (const pkg of packages) {
        const plan = giftPlanOf(pkg)
        if (plan && plans[plan] === null) plans[plan] = pkg
    }
    return plans
}

/**
 * ## Why there is no discount table here any more
 *
 * `/gift-premium` shipped legacy's two literals — `-35% off billed` on the year and `-10%` on the
 * half-year — as declared copy, because they are not derivable from the catalogue: at the live
 * prices all three tiers are the **same $8.33 a month**, so any honest computation prints 0% and 1%.
 *
 * Then the origin of `-35%` turned up, and it is worse than unverifiable. It is **`/premium`'s
 * number**: that screen's annual plan is $77.92 against 12 × $9.99 monthly = $119.88, which is
 * exactly 35% — copy-pasted onto a gift card that costs $99.99, where the real saving against the
 * monthly subscription is **17%**. The chip overstated it by roughly two-to-one, on the one surface
 * of this app that takes money for somebody else.
 *
 * And 17% is the saving on **all three** gift tiers, because they are one rate — so no percentage
 * distinguishes the cards even when it is computed correctly.
 *
 * What a reader actually needs in order to choose between 3, 6 and 12 months is the **rate**, and
 * {@link giftMonthlyEquivalent} is it: the card prints the total it charges and the per-month figure
 * underneath, which is the unit that makes three different durations comparable and the convention
 * `/premium`'s own annual card uses (its hero figure is `$6.49 /month`). It is derived from the price
 * directly above it, so it is checkable by eye and cannot go stale.
 *
 * If the backend ever sends a real discount per package, **that** is what a chip should print — the
 * question is **B99 §4** in
 * [`docs/BACKEND_QUESTIONS.md`](../../../../docs/BACKEND_QUESTIONS.md).
 */

/**
 * What a gift plan works out at per month — the "all for just X/month" figure the About panel and
 * nothing else needs.
 *
 * **The card's second line**, under the total it charges — the figure that makes 3, 6 and 12 months
 * comparable at a glance, and the one this screen used to replace with a percentage nobody could
 * check. See the note above.
 *
 * Not rounded here: it is money about to be formatted, and rounding before `formatFiatAmount` sees
 * it applies two rounding rules to one number, one of which does not know the currency's minor unit
 * (VND has none — see `shared/lib/money.ts`).
 *
 * `duration_days / 30` rather than a calendar month, which is the same approximation the catalogue
 * itself makes by pricing a "3 months" package at 90 days.
 */
export function giftMonthlyEquivalent(pkg: PremiumPackage): number {
    const months = pkg.duration_days / 30
    return months > 0 ? pkg.price / months : pkg.price
}

/**
 * The translation keys each plan's copy hangs off.
 *
 * A record rather than three `switch`es, and **not** built by interpolating the plan name into a
 * string: `keys.test.ts` only sees literal keys, so `t(`giftpremium_plan_${plan}`)` is a key nothing
 * can typo-check — it renders as its own name on the screen. Every key below is a literal, and
 * because `GiftPlan` is a union a fourth plan fails to compile here rather than going untranslated.
 */
export const GIFT_PLAN_COPY: Record<GiftPlan, { name: string }> = {
    quarter: { name: 'giftpremium_plan_quarter' },
    half: { name: 'giftpremium_plan_half' },
    year: { name: 'giftpremium_plan_year' },
}
