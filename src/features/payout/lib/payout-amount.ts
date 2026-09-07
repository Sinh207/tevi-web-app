import { PAYOUT_MIN_AMOUNT } from '../api/payout-request-api'

/**
 * How much of the balance a given method may take, and whether a typed figure is allowed.
 *
 * Legacy's `validateAmount` and its `maxAmount` memo, extracted so both can be tested: they decide
 * whether a button that moves money is pressable, which is not something a comment can pin.
 */

/**
 * The ceiling — **the lesser of the balance and the method's remaining daily allowance**.
 *
 * `0` when either is missing or non-positive, and that is legacy's own arithmetic:
 *
 * ```js
 * if (!balanceTEVI || !dailyLimit || balanceTEVI <= 0 || dailyLimit <= 0) return 0
 * ```
 *
 * A `0` ceiling makes every figure invalid, which is the right answer — a method with no allowance left
 * cannot take a withdrawal today, and a screen that let somebody submit one would be showing them a
 * server error instead of a limit.
 *
 * ⚠ **A missing `dailyLimitRemainder` therefore blocks the form**, not opens it. That is legacy's
 * behaviour and it is the safe direction on money, but it means a payload that stops sending the field
 * silently disables withdrawals — worth knowing when a method suddenly cannot be used.
 */
export function payoutMaxAmount(balance: number, dailyLimitRemainder: number | null): number {
    const limit = dailyLimitRemainder ?? 0
    if (balance <= 0 || limit <= 0) return 0
    /*
     * **Floored to two decimals**, because two decimals is what can be *sent*: `amount` goes over as a
     * `decimal` string and every figure on these screens is quoted to two.
     *
     * Without the floor, a balance of `4400.035` made **Max** fill the field with `4400.035`, which
     * passes validation (it is not above the ceiling — it *is* the ceiling) and then leaves as
     * `"4400.04"` — a request for more than the account holds, refused by the server with a message the
     * reader cannot act on because the field shows a figure that looks correct.
     *
     * Floor and not round: rounding is what created the extra cent.
     */
    return Math.floor(Math.min(balance, limit) * 100) / 100
}

/**
 * What is wrong with the typed amount, as a translation **key**, or `null` when it is allowed.
 *
 * A key rather than a sentence, for the reason every other error in this repo is: nine locales, and the
 * one place a backend message is shown verbatim (`payout-request-errors.ts`) is explicitly the
 * exception. The two limit keys take the formatted figure as an interpolation, which is why they are
 * returned alongside the number rather than pre-composed.
 *
 * Legacy's order is reproduced exactly, and the order is load-bearing: an empty field says "required"
 * rather than "below the minimum", and a negative figure says "negative" rather than "below the
 * minimum" — the same number would satisfy both rules and the messages are not equally useful.
 */
export type PayoutAmountError =
    | { key: 'payout_request_amount_required' }
    | { key: 'payout_request_amount_negative' }
    | { key: 'payout_request_amount_min'; limit: number }
    | { key: 'payout_request_amount_max'; limit: number }

export function payoutAmountError(
    amount: number | null,
    max: number,
    min: number = PAYOUT_MIN_AMOUNT,
): PayoutAmountError | null {
    /*
     * `null` **and** `0` are both "required" — legacy tests `!value`, and a zero withdrawal is not a
     * withdrawal. `NaN` lands here too, which is what an unparseable input produces.
     */
    if (amount === null || !Number.isFinite(amount) || amount === 0) {
        return { key: 'payout_request_amount_required' }
    }
    if (amount < 0) return { key: 'payout_request_amount_negative' }
    if (amount < min) return { key: 'payout_request_amount_min', limit: min }
    if (amount > max) return { key: 'payout_request_amount_max', limit: max }
    return null
}

/**
 * The amount to put in the field when a method is chosen — legacy's `handleSelectMethod`, and the
 * effect that seeds the field on load.
 *
 * Both do the same thing in different words: **offer the largest allowed figure**. A creator opening
 * this screen almost always wants to withdraw what they have, so the field arrives filled rather than
 * empty, and choosing a method with a smaller allowance clamps down to it instead of leaving a figure
 * the server would reject.
 *
 * `null` when nothing can be offered — a zero ceiling — so the caller clears the field rather than
 * writing a `0` somebody has to delete.
 */
export function payoutSuggestedAmount(
    balance: number,
    dailyLimitRemainder: number | null,
): number | null {
    const max = payoutMaxAmount(balance, dailyLimitRemainder)
    return max > 0 ? max : null
}

/**
 * The string to send as `amount`.
 *
 * The schema types the field `decimal`, so it goes over as a **string**: handing the server whatever
 * `JSON.stringify` makes of a float is not a detail on money. Two decimals, which is what every figure
 * on these screens is quoted to — `payout-two-decimals-is-legacy` in the money formatter carries the
 * same call.
 */
export function payoutAmountPayload(amount: number): string {
    /*
     * **Floor, never round.** `toFixed(2)` rounds half-up, so `4400.035` left as `"4400.04"` — a cent
     * more than the reader typed and, at the ceiling, a cent more than they have.
     *
     * `payoutMaxAmount` already floors the ceiling, so the two agree; this is the second guard, on the
     * path where the figure actually leaves the browser. A cent is not a rounding detail when the
     * server's answer is "insufficient balance".
     */
    return (Math.floor(amount * 100) / 100).toFixed(2)
}
