import { STAR_CURRENCY } from '@features/balance'
import type { FeeCoefficients } from '../api/donation-fee-api'

/**
 * The offer's cash currency.
 *
 * A literal rather than a lookup because the offer's cash line is `USD` by contract (`api/types.ts`);
 * it lives here rather than in the dialog now that the **hook** needs it too — the Pay button's label
 * is built where the order is built.
 */
export const DONATION_USD = {
    code: 'USD',
    name: 'US Dollar',
    symbol: '$',
    decimalDigits: 2,
} as const

import type { DirectDonate, DonationPrice } from '../api/types'

/**
 * The arithmetic behind the donate dialog — quantity ↔ amount, and what makes a press legal.
 *
 * ## Why it is pure, and in its own file
 *
 * The dialog holds **raw input strings**, not numbers, because a controlled `<input>` that coerces
 * every keystroke cannot be typed into: clearing the field, typing a leading `0`, or starting a
 * decimal all round-trip through the state. Legacy learnt this the hard way and left two comments
 * about it (`'3' + 0.51` concatenating to `'30.51'`, `Intl.NumberFormat` rendering a mid-typing
 * `'0.'` as `NaN`). So every number in this dialog goes through `toNumber` first, and the rule
 * "never do arithmetic on the field value" is enforceable only if the arithmetic lives somewhere a
 * test can reach.
 */

/**
 * The two ways a donation can be paid for.
 *
 * `'star'` is the platform balance (`TVS` on the wire), `'cash'` is card (`USD`). The names are the
 * product's, not the wire's, for the reason `features/permission` gives about capability names: a
 * screen should say what the reader is choosing, and `TVS` is an implementation detail of Star.
 */
export const DONATION_CURRENCIES = ['star', 'cash'] as const
export type DonationCurrency = (typeof DONATION_CURRENCIES)[number]

/** Which wire code each option is priced in. */
const WIRE_CURRENCY: Record<DonationCurrency, string> = { star: STAR_CURRENCY, cash: 'USD' }

/**
 * The unit price used when the offer carries no line for that currency. Legacy's fallbacks,
 * unchanged: `100` Star, `$1`.
 */
const FALLBACK_UNIT: Record<DonationCurrency, number> = { star: 100, cash: 1 }

/** @deprecated internal alias kept for readability at the Star-only call sites. */
export const DEFAULT_STAR_UNIT = FALLBACK_UNIT.star

/** Two decimal places, the most any of these currencies has. */
function roundMoney(value: number): number {
    return Math.round(value * 100) / 100
}

/**
 * A field value as a number, or `0`.
 *
 * `0` rather than `NaN` on purpose: every caller's next step is a comparison, and `NaN` fails every
 * comparison including the ones that should reject it. An empty field and a field holding `abc` are
 * both "no amount", which is what `0` means here — and `0` is itself invalid (see `canDonate`), so
 * nothing downstream has to tell the two apart.
 */
export function toNumber(value: string | number | null | undefined): number {
    if (typeof value === 'number') return Number.isFinite(value) ? value : 0
    if (typeof value !== 'string') return 0
    const parsed = Number.parseFloat(value)
    return Number.isFinite(parsed) ? parsed : 0
}

/**
 * The price of one unit — one coffee, one pizza — in the chosen currency.
 *
 * Selected **by currency, never by position**: the offer carries a line per currency and nothing
 * guarantees their order. Legacy uses the same `findIndex` over `amount_currency`, which is the only
 * evidence there is about how these are meant to be read.
 *
 * A price of `0` or a missing line both fall back, because a unit of zero makes `quantityFromAmount`
 * a division by zero and would let the stepper offer an infinite number of free coffees.
 */
export function unitPrice(
    offer: DirectDonate | null | undefined,
    currency: DonationCurrency,
): number {
    const line = offer?.prices.find(
        (price: DonationPrice) => price.amount_currency === WIRE_CURRENCY[currency],
    )
    const amount = line?.amount ?? 0
    return amount > 0 ? amount : FALLBACK_UNIT[currency]
}

/** The Star unit price — the common case, named so the Star call sites read plainly. */
export function starUnitPrice(offer: DirectDonate | null | undefined): number {
    return unitPrice(offer, 'star')
}

/**
 * Whether the offer carries a real price in that currency.
 *
 * Note this is **not** `unitPrice(...) > 0`: that always is, because of the fallback. This asks
 * whether the creator actually offered the option, which is what decides if the tab is shown.
 */
export function hasPrice(
    offer: DirectDonate | null | undefined,
    currency: DonationCurrency,
): boolean {
    return Boolean(offer?.prices.some(price => price.amount_currency === WIRE_CURRENCY[currency]))
}

/** Whether the offer can be bought with Star at all — the button's precondition. */
export function hasStarPrice(offer: DirectDonate | null | undefined): boolean {
    return hasPrice(offer, 'star')
}

/**
 * `quantity × unit`, as the amount field should read after the stepper moves.
 *
 * Rounded to two places because a cash unit is a decimal: `3 × 1.1` is `3.3000000000000003` in
 * binary floating point, and that is what would land in the field and then in the request body.
 * Star units are integers, so the rounding is a no-op there.
 */
export function amountFromQuantity(quantity: string | number, unit: number): number {
    const value = roundMoney(toNumber(quantity) * unit)
    return Number.isFinite(value) ? value : 0
}

/**
 * How many whole units an amount buys — what the stepper should read after the amount is typed.
 *
 * **Floored**, so 250 Star at 100 a coffee shows 2 rather than 2.5: the quantity is a count of
 * things, and the amount is what is actually charged. Legacy floors it too, and the consequence is
 * deliberate — someone who types an amount between two units keeps their amount, and the counter
 * simply lags behind it rather than rounding their money up.
 */
export function quantityFromAmount(amount: string | number, unit: number): number {
    if (unit <= 0) return 0
    const value = Math.floor(toNumber(amount) / unit)
    return Number.isFinite(value) && value > 0 ? value : 0
}

/**
 * Whether the Donate press is legal.
 *
 * Only what the client can actually judge — there is an amount, and it is **at least one unit** of
 * what the creator is offering. Every other reason this can fail (not enough Star, the offer
 * withdrawn, the account restricted) is the server's or `useRequireStars`'s answer, and pre-empting
 * those here would disable the button for people it should not.
 *
 * ## The minimum is enforced because the screen states it
 *
 * This used to be `> 0` while the field printed "Enter at least 250 Star" — so on a 250-Star coffee,
 * typing `1` cleared the message, enabled the button, showed "Buy Ada 1 × Coffee?" on the confirm
 * screen (the quantity floors to 0 and is displayed as `Math.max(1, …)`) and posted `tvs_amount: 1`
 * for an offer whose unit price the backend divides by. A screen that states a rule and then accepts
 * its violation is worse than one that states nothing.
 *
 * `unit <= 0` means the offer carried no usable price (`unitPrice` falls back, see its note), and
 * there is then nothing to compare against — the old `> 0` rule is all that is left.
 */
export function canDonate(amount: string | number, unit = 0): boolean {
    const value = toNumber(amount)
    return unit > 0 ? value >= unit : value > 0
}

/**
 * The processor's fee on a card donation: `(x · amount + y) / z`.
 *
 * Legacy's formula, unchanged, and the shape is not arbitrary — `x` is the percentage, `y` the flat
 * per-transaction component, and `z` the gross-up divisor that makes the **creator** receive the
 * amount the donor chose rather than that amount minus the cut. Getting `z` wrong by dividing in the
 * wrong direction is the kind of error that is invisible at $1 and material at $500, which is why
 * this is here with a test rather than inline at the call site.
 *
 * `null` coefficients mean the fee service has not answered. The answer is then **`null`, not `0`** —
 * "we do not know the fee" and "there is no fee" are different sentences and only one of them is
 * safe to print beside a total. Legacy returns `0` for both and quietly understates the charge.
 */
export function donationFee(
    amount: string | number,
    coefficients: FeeCoefficients | null | undefined,
): number | null {
    if (!coefficients?.z) return null
    const value = (coefficients.x * toNumber(amount) + coefficients.y) / coefficients.z
    return Number.isFinite(value) ? roundMoney(Math.max(0, value)) : null
}

/**
 * What the card is actually charged — the donation plus the fee.
 *
 * With an unknown fee this is the **amount alone**, and the caller has to show that the figure is
 * provisional (the dialog leaves the fee row as an em dash). Adding a guessed fee would be worse and
 * hiding the total entirely would leave the reader with no figure at all.
 */
export function chargedTotal(amount: string | number, fee: number | null | undefined): number {
    return roundMoney(toNumber(amount) + (fee ?? 0))
}
