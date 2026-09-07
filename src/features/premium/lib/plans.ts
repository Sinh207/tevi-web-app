import type { PremiumPackage } from '../api/types'

/**
 * Turning a list of packages into the three cards the screen draws — and the arithmetic on them.
 *
 * ## `duration_days` is the identity, because it is all there is
 *
 * The payload carries no plan name, no cadence and no `interval`: legacy picks its three packages
 * by matching `duration_days` against 7, 30 and 365, and this is a port of that. Anything else
 * (a 90-day package, a 14-day trial) is a row **no card can label**, so it is dropped rather than
 * rendered with a made-up heading — `planOf` answering `null` is what makes that explicit instead
 * of implicit in an `if/else` chain.
 *
 * ## Why this is a pure module with no React in it
 *
 * Two reasons, and the second is the one that matters. The first is the ordinary one: percentages
 * and a `find` are not state. The second is that **the discount is a claim about money**. "Save
 * 25%" is a number this client computes and prints beside a price, so it has to be pinned by a
 * test rather than read out of a component — and the cases worth pinning are the ones that make it
 * a lie: a monthly package that is missing (nothing to compare against), an annual price that is
 * *higher* than twelve monthly ones, and the rounding at the boundary.
 */

/** The three cadences the product sells, keyed by what the wire says. */
export const PLAN_DURATION_DAYS = {
    weekly: 7,
    monthly: 30,
    annual: 365,
} as const

export type PremiumPlan = keyof typeof PLAN_DURATION_DAYS

/**
 * Left to right, as legacy renders them: **weekly, annual, monthly**.
 *
 * The annual card is in the middle because it is the recommended one — it carries the "Best Value"
 * crown, the gold frame and the two flanking cards sit 16px lower on desktop so it stands proud of
 * them. Below `md` the three stack in this same order, so the recommendation is the second thing
 * read rather than the last.
 */
export const PLAN_ORDER: readonly PremiumPlan[] = ['weekly', 'annual', 'monthly'] as const

/** Which plan a package is, or `null` for a cadence this screen has no card for. */
export function planOf(pkg: PremiumPackage): PremiumPlan | null {
    for (const plan of PLAN_ORDER) {
        if (pkg.duration_days === PLAN_DURATION_DAYS[plan]) return plan
    }
    return null
}

/** The three packages, by plan. A plan the payload did not offer is `null`. */
export type PremiumPlans = Record<PremiumPlan, PremiumPackage | null>

/**
 * Index the packages by plan.
 *
 * **First match wins.** Two packages with the same `duration_days` is a catalogue mistake, not a
 * choice to offer the reader: picking the cheaper would quietly undercut whatever the backoffice
 * meant, and rendering both would put two annual cards on the screen. The payload's own order
 * decides, which is the one thing the backoffice can control.
 */
export function groupPlans(packages: readonly PremiumPackage[]): PremiumPlans {
    const plans: PremiumPlans = { weekly: null, monthly: null, annual: null }
    for (const pkg of packages) {
        const plan = planOf(pkg)
        if (plan && plans[plan] === null) plans[plan] = pkg
    }
    return plans
}

/**
 * What an annual subscription costs per month — the big figure on the annual card.
 *
 * Not rounded here: it is money about to be formatted, and rounding it before `formatFiatAmount`
 * sees it would apply *two* rounding rules to one number, one of which does not know the
 * currency's minor unit (VND has none — see `shared/lib/money.ts`).
 */
export function monthlyEquivalent(annual: PremiumPackage): number {
    return annual.price / 12
}

/**
 * How much the annual plan saves against paying monthly, as a whole percentage — or `null` when
 * there is no honest number to print.
 *
 * `null`, not `0`, in all three of these cases, because the card must then draw **no discount line
 * at all** rather than "0% off billed annually":
 *
 * - **no monthly package** — there is nothing to compare against, and comparing against the weekly
 *   one would be a different claim;
 * - **a non-positive monthly price** — the parser already drops those rows, so this is defence
 *   against a future caller rather than a live case, and dividing by it would answer `Infinity`;
 * - **an annual price that is not actually cheaper** — a catalogue mid-edit, or a genuine price
 *   rise. Legacy prints `-0% off` here, and its `Math.round` turns a 0.4% saving into the same
 *   thing.
 *
 * Rounded, like legacy, so `24.6%` reads as `25%`.
 */
export function savingsPercent(plans: PremiumPlans): number | null {
    const { annual, monthly } = plans
    if (!annual || !monthly || monthly.price <= 0) return null
    const paidMonthly = monthly.price * 12
    const saved = Math.round(((paidMonthly - annual.price) / paidMonthly) * 100)
    return saved > 0 ? saved : null
}

/** What paying monthly for a year would cost — the struck-through figure on the annual card. */
export function yearAtMonthlyPrice(monthly: PremiumPackage): number {
    return monthly.price * 12
}

/**
 * The translation keys each plan's copy hangs off.
 *
 * Returned as a record rather than three `switch`es, and **not** built by interpolating the plan
 * name into a string: `keys.test.ts` only sees literal keys, so `t(`premium_plan_${plan}`)` is a
 * key nothing can typo-check — it renders as its own name on the screen. Every key below is a
 * literal, and because `PremiumPlan` is a union a fourth plan fails to compile here rather than
 * going untranslated.
 */
export const PLAN_COPY: Record<
    PremiumPlan,
    { name: string; tier: string; price: string; unit: string }
> = {
    weekly: {
        name: 'premium_plan_weekly',
        tier: 'premium_tier_starter',
        price: 'premium_price_per_week',
        unit: 'premium_unit_week',
    },
    monthly: {
        name: 'premium_plan_monthly',
        tier: 'premium_tier_rising',
        price: 'premium_price_per_month',
        unit: 'premium_unit_month',
    },
    annual: {
        name: 'premium_plan_annual',
        tier: 'premium_tier_legend',
        price: 'premium_price_per_year',
        unit: 'premium_unit_year',
    },
}
