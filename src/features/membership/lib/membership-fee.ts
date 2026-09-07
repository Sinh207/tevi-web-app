/**
 * The processor's fee on a **card** membership — legacy's
 * `(0.059 × price + 0.30) / 0.941`, i.e. 5.9% + $0.30 grossed up.
 *
 * ## ⚠ The rate is hardcoded — **confirmed as the contract** (B71, answered)
 *
 * Unlike a donation, which fetches its coefficients (`paymee/payment/v3/direct-donation-fee/` →
 * `{ x, y, z }`), a membership has **no fee endpoint**, and the backend's answer is that there is not
 * going to be one for now: mirror the legacy web app. So legacy's own expression is the specification,
 * and `membership-fee.test.ts` asserts against a transcription of it — every whole cent from $0.01 to
 * $200.00 — rather than against numbers somebody typed into an expectation.
 *
 * The consequence used to be an accepted risk: the day the platform renegotiates the rate, every
 * membership confirm would be quietly wrong by a few cents until somebody edited this file.
 *
 * ## ✅ A live payload has since both confirmed it and made it non-load-bearing
 *
 * `subscribe/` answered `payment.amount: "1.38"` for a `$1.00` tier — exactly what this file computes
 * — so the formula is right, and it is billy's own. **And the same envelope states it**, which means a
 * screen no longer has to trust this arithmetic: the webview checkout reads `payment.amount`
 * (`parseChargedAmount`) and derives the fee from it, falling back here only until the intent exists.
 * See **B85**.
 *
 * This function stays: it is what a screen shows *before* an intent has been created — the website's
 * join dialog, and this screen's first frame — and it is what the fallback needs.
 *
 * It is also a **different rate** from the donation one (5.9% vs whatever the endpoint answers), so
 * the two are not one shared helper wearing two names. The *shape* is identical, which is exactly why
 * they are easy to conflate: the gross-up divisor `z` is what makes the creator receive the tier
 * price rather than the price minus the cut, and dividing the wrong way is invisible at $5 and
 * material at $500.
 */
export const MEMBERSHIP_FEE_RATE = { percent: 0.059, flat: 0.3, grossUp: 0.941 } as const

/** Two decimal places, the most USD has. */
function roundMoney(value: number): number {
    return Math.round(value * 100) / 100
}

/**
 * The fee on a tier priced at `usd`, or `0` for a price that is not a positive number.
 *
 * `0` rather than `null` here, unlike `features/donation`'s `donationFee`: that one can genuinely
 * *not know* the fee, because it depends on a request that may not have answered. This one is
 * arithmetic on a constant — there is no unknown state to represent.
 */
export function membershipFee(usd: number | null | undefined): number {
    if (typeof usd !== 'number' || !Number.isFinite(usd) || usd <= 0) return 0
    const { percent, flat, grossUp } = MEMBERSHIP_FEE_RATE
    const fee = (percent * usd + flat) / grossUp
    return Number.isFinite(fee) ? roundMoney(Math.max(0, fee)) : 0
}

/** What the card is actually charged: the tier price plus the fee. */
export function membershipChargedTotal(usd: number | null | undefined): number {
    const price = typeof usd === 'number' && Number.isFinite(usd) && usd > 0 ? usd : 0
    return roundMoney(price + membershipFee(price))
}
