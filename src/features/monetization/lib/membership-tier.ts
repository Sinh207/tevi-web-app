import type { MyPackage, PackagePrice } from '../api/types'

/**
 * The rules the membership setup form is built on — the price ladder, the two length limits, and
 * how a saved tier is read back into the form.
 *
 * Pure, so `membership-tier.test.ts` can pin the parts that fail *quietly*: a price that does not
 * match any rung silently resets the form to `$2`, and a payload built with the wrong currency
 * strings is accepted by the API and charges the wrong amount.
 */

/**
 * The five prices a creator may charge, and the Star figure each one is shown as.
 *
 * **Legacy's ladder, verbatim** (`MEMBERSHIP_PRICE_OPTIONS`), including the 100 ★ = $1 rate baked
 * into each row rather than computed. It is written out because it is a *product* table — the rungs
 * are a pricing decision, not arithmetic — and because legacy's own comment records the constraint
 * that shaped it: *"max 2000 stars per API limit"*.
 *
 * Do not derive `stars` from `usd`. The day the rate moves, the ladder moves with it as a decision,
 * not as a rounding.
 */
export const MEMBERSHIP_PRICE_LADDER = [
    { usd: 2, stars: 200 },
    { usd: 5, stars: 500 },
    { usd: 10, stars: 1000 },
    { usd: 15, stars: 1500 },
    { usd: 20, stars: 2000 },
] as const

export type MembershipPriceRung = (typeof MEMBERSHIP_PRICE_LADDER)[number]

/** Legacy's `MEMBERSHIP_NAME_MAX_LENGTH`. Enforced in the field, and shown as a counter. */
export const MEMBERSHIP_NAME_MAX = 64

/** Legacy's `MEMBERSHIP_DESCRIPTION_MAX_LENGTH`. */
export const MEMBERSHIP_DESCRIPTION_MAX = 500

/**
 * The platform's cut, as legacy states it in the setup form's notice.
 *
 * A **hard-coded 15**, which is what legacy interpolates. It is not `features/membership`'s
 * `membership-fee.ts` (5.9% + $0.30) — that is the *buyer's* processing fee on a card charge, and
 * this is the *seller's* revenue share. Two different numbers about two different sides of the same
 * transaction, which is exactly why they must not be folded into one constant. Whether 15 is still
 * the rate, and whether it is served anywhere, is **B103**.
 */
export const MEMBERSHIP_SYSTEM_FEE_PERCENT = 15

/** The wire's currency codes. `TVS` is Star; `USD` is the fiat figure shown on the ladder. */
export const STAR_CURRENCY = 'TVS'
export const USD_CURRENCY = 'USD'

/** The amount for one currency on a tier, or `null` when the tier does not carry it. */
export function priceIn(
    prices: readonly PackagePrice[] | undefined,
    currency: string,
): number | null {
    const row = prices?.find(price => price.amount_currency === currency)
    return row ? row.amount : null
}

/** The Star figure a tier is advertised at — what the hero card and the member rows print. */
export function starPriceOf(pkg: MyPackage | null | undefined): number {
    return priceIn(pkg?.prices, STAR_CURRENCY) ?? 0
}

/**
 * Which rung a saved tier sits on, as an index into the ladder.
 *
 * Matched on the **USD** figure, which is legacy's own comparison, and falls back to `0` — the
 * cheapest rung — when nothing matches. That fallback is the quiet failure this function exists to
 * make testable: a creator whose tier was priced outside the ladder (by an older client, or by the
 * backoffice) opens the form to find it silently reset to `$2`, and pressing Save at that point
 * *lowers their price*. `matchPriceRung` returning `-1` is what lets the form tell the two apart.
 */
export function matchPriceRung(pkg: MyPackage | null | undefined): number {
    const usd = priceIn(pkg?.prices, USD_CURRENCY)
    if (usd === null) return -1
    return MEMBERSHIP_PRICE_LADDER.findIndex(rung => rung.usd === usd)
}

/**
 * The `prices` array to write for a rung.
 *
 * **Star as a number, USD as a string** — legacy's exact shapes (`amount: selectedPrice.stars` and
 * `amount: String(selectedPrice.value)`). It looks like an inconsistency and is left alone: billy
 * accepts both, this is the payload that has been shipping, and "tidying" a wire format is how a
 * write starts being rejected for a reason no screen can explain. **B103** asks whether either
 * spelling is required.
 *
 * Order is legacy's too — Star first — for the same reason.
 */
export function pricesPayload(rung: MembershipPriceRung) {
    return [
        { amount: rung.stars, amount_currency: STAR_CURRENCY },
        { amount: String(rung.usd), amount_currency: USD_CURRENCY },
    ]
}

/** Star per US dollar — Tevi's platform rate, and the ratio every rung of the ladder above is built on. */
export const STAR_PER_USD = 100

export interface MemberPriceDisplay {
    /** The figure to print beside the Star mark. */
    star: number
    /** The same amount as cash, in USD, for the line under it. */
    usd: number
}

/**
 * What one member actually pays, in **both** units — or `null` when the payload gave nothing usable.
 *
 * A row carries one figure and one currency (`package_price` + `package_price_currency`), never
 * both, and the design draws both — so one of the two is always derived. `USD` rows are real: this
 * screen shipped once showing the Star line *only* for `TVS`, which meant a creator paid in cash saw
 * a member row with no price on it at all. That is the bug this function exists to close.
 *
 * ## A second copy of `features/membership/lib/membership-price.ts`, and a deliberate one
 *
 * The reader's side solves the identical problem for `/my-membership`, and the two cannot share:
 * a feature may not import another feature's `lib/`. What is copied is the **decision**, not just the
 * arithmetic — read that file for the full reasoning, which holds verbatim here:
 *
 * - **`null`, never `0`.** Legacy prints `0` and `($0)` for a price it could not read, which is a
 *   claim about somebody's money and wrong in the direction that matters — the creator is told a
 *   paying member is free. An unusable price prints no figure.
 * - **A third currency is not guessed at.** Deriving the other unit from anything but `TVS`/`USD`
 *   would fabricate one of the two figures, and a row is better with no price than an invented one.
 *
 * Whether a row could ever carry both figures — which would make this a lookup instead of a rate — is
 * **B51**, asked on the same pair of fields.
 */
export function memberPrice(
    amount: number | null | undefined,
    currency: string | null | undefined,
): MemberPriceDisplay | null {
    if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) return null

    switch (currency?.trim().toUpperCase()) {
        case STAR_CURRENCY:
            return { star: amount, usd: amount / STAR_PER_USD }
        case USD_CURRENCY:
            return { star: amount * STAR_PER_USD, usd: amount }
        default:
            return null
    }
}
