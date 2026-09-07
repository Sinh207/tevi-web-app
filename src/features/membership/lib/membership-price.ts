/**
 * What a membership row costs, in both units.
 *
 * ## The rate is hardcoded, because the payload carries one figure and one currency
 *
 * A row's `package_price` is what was actually charged, in `package_price_currency` — **one** of
 * `TVS` or `USD`, never both. The design draws both: the Star figure with the gold mark, and the
 * cash equivalent in parentheses under it. So one of the two is always derived, and legacy derives
 * it with a bare `× 100` / `÷ 100` at the call site (`myMembershipItem/index.js`).
 *
 * That constant is Tevi's Star price and it is stable, but it is still a **platform** number sitting
 * in client code, so it is named, stated once, and asked about in **B51**: `prices[]` on the package
 * carries a line per currency, and if a row could carry both figures this whole file becomes a
 * lookup. Until then, one definition beats four multiplications.
 *
 * ## `null` rather than `0`
 *
 * Legacy renders `0` and `($0)` for a row whose price it could not read. That is a claim about what
 * somebody is paying, and it is wrong in the direction that matters: a reader checking what a
 * renewal will cost is told it is free. So an unusable price resolves to `null` and the row prints
 * no figure at all — the same rule `features/balance`'s `isKnown` states for the balance itself.
 */

/** Star per US dollar. Tevi's platform rate — see the file's note and **B51**. */
export const STAR_PER_USD = 100

export interface MembershipPriceDisplay {
    /** The figure to print beside the Star mark. */
    star: number
    /** The cash equivalent, in USD. */
    usd: number
}

/**
 * Both units for one row, or `null` when the payload gave nothing to work from.
 *
 * `TVS` is Star, `USD` is cash. Any other currency — or none — is **not** guessed at: a third
 * currency would make one of the two figures a fabrication, and the row is better with no price
 * than with an invented one.
 */
export function membershipPrice(
    amount: number | null | undefined,
    currency: string | null | undefined,
): MembershipPriceDisplay | null {
    if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) return null

    switch (currency?.trim().toUpperCase()) {
        case 'TVS':
            return { star: amount, usd: amount / STAR_PER_USD }
        case 'USD':
            return { star: amount * STAR_PER_USD, usd: amount }
        default:
            return null
    }
}
