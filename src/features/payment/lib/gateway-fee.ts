import type { Gateway } from '../api/types'

/**
 * What a gateway actually charges for a USD price — the fee, the conversion, and the rounding.
 *
 * ## One formula, in one place, with tests
 *
 * Legacy computes this inside `useGetStar.handleTotalCost` and renders it through
 * `renderTotalCostDisplay`, both untested, with a `price <= 0.01 ? price * 100` branch threaded
 * through them for the "1 ★ ≈ …" line. Every screen that shows a total re-derives it from the
 * provider. Here it is four pure functions.
 *
 * ## The shape of the charge
 *
 *     usd   = price + price × fee_percent_rate / 100 + fee_flat_amount
 *     local = round(usd × usd_conversion_rate / min_unit) × min_unit
 *
 * `fee_percent_rate` is a **percentage**, not a fraction (`2.9` = 2.9%). `min_unit` is the smallest
 * amount the gateway will take — 0.01 for USD, 1 000 for a VND wallet — and rounding to it is what
 * keeps the figure on screen equal to the figure the gateway bills.
 *
 * ## When the conversion is unknown, the figure stays in USD
 *
 * `usd_conversion_rate` or `min_unit` missing means the service did not say how to convert. Legacy
 * returns the **USD** total and then labels it with the gateway's currency id — printing a dollar
 * amount as though it were dong. Here `converted: false` comes with `currencyId: '$'`, because the
 * number really is dollars, and a screen that must not guess can check the flag.
 */

/** USD price of one Star. Legacy's own constant, implied by its `0.01` sentinel. */
export const STAR_UNIT_PRICE_USD = 0.01

/** The dollar sign is what legacy's payloads carry as the USD `currency.id`. */
export const USD_CURRENCY_ID = '$'

export interface GatewayCharge {
    /** The amount to display, in `currencyId`. */
    amount: number
    /** The gateway's `currency.id` — a symbol (`$`) or a code (`VND`), as the wire has it. */
    currencyId: string
    /** `false` when the amount is still in USD because no conversion was available. */
    converted: boolean
}

/** Kill floating-point dust without truncating a small `min_unit`. */
function round(value: number, decimals = 6): number {
    const factor = 10 ** decimals
    return Math.round(value * factor) / factor
}

function roundToUnit(value: number, unit: number): number {
    return round(Math.round(value / unit) * unit)
}

/**
 * The gateway's cut on a USD price, in USD. `null` when there is no gateway to ask.
 *
 * `0` is a real answer — a gateway with neither a percentage nor a flat component charges nothing —
 * and it is different from `null`, which is "no gateway chosen yet". The fee row shows an em dash for
 * one and `$0.00` for the other.
 */
export function gatewayFeeUsd(
    priceUsd: number,
    gateway: Gateway | null | undefined,
): number | null {
    if (!gateway || !Number.isFinite(priceUsd) || priceUsd < 0) return null
    const percent = (priceUsd * gateway.fee_percent_rate) / 100
    return round(percent + gateway.fee_flat_amount, 2)
}

/**
 * The total the reader is asked to pay. `null` when the price or the gateway is not known yet.
 *
 * ⚠ This is a **display** figure. The authority is the gateway's own confirmation screen and the
 * amount on the PaymentIntent — which is why nothing in this feature ever sends a computed total
 * back to the backend.
 */
export function gatewayTotal(
    priceUsd: number,
    gateway: Gateway | null | undefined,
): GatewayCharge | null {
    const fee = gatewayFeeUsd(priceUsd, gateway)
    if (fee === null || !gateway) return null

    const usd = round(priceUsd + fee, 2)
    const rate = gateway.currency?.usd_conversion_rate ?? 0
    const unit = gateway.currency?.min_unit ?? 0

    if (rate > 0 && unit > 0) {
        return {
            amount: roundToUnit(usd * rate, unit),
            currencyId: gateway.currency?.id || USD_CURRENCY_ID,
            converted: true,
        }
    }

    return { amount: usd, currencyId: USD_CURRENCY_ID, converted: false }
}

/**
 * The "1 ★ ≈ …" line beside a gateway.
 *
 * Computed at **100 Star and divided back down**, which is legacy's `price * 100` trick made
 * explicit: one Star is a cent, and rounding a cent to a `min_unit` of 1 000 dong would print the
 * whole flat fee as the price of a single Star. Amortising over 100 keeps the rate readable, and the
 * flat component is therefore *approximate* — the line is labelled `≈` for that reason, and this is
 * the only function in the file whose answer is not exact.
 */
export function gatewayRatePerStar(gateway: Gateway | null | undefined): GatewayCharge | null {
    const hundred = gatewayTotal(STAR_UNIT_PRICE_USD * 100, gateway)
    if (!hundred) return null
    return { ...hundred, amount: round(hundred.amount / 100, hundred.converted ? 4 : 6) }
}

/** Whether a charge should print its currency **before** the number. Legacy's own rule. */
export function isSymbolFirst(charge: GatewayCharge): boolean {
    return charge.currencyId === USD_CURRENCY_ID || charge.currencyId === ''
}

/**
 * Whether this gateway will accept a USD price at all.
 *
 * A real `gw.stripe` row carries `min_payment_amount: "0.00"` and `max_payment_amount: null` — no
 * limits — but the fields exist, and a wallet with a floor is the reason they do. Without this check
 * the sheet offers a $0.99 package to a gateway with a $5 minimum, and the reader presses Pay to get a
 * **400 with nothing on screen explaining it**: the band is declared in the catalogue, so refusing
 * there is the client's job rather than the backend's to discover.
 *
 * The comparison is against the **package price**, not the charged total: the band is what the gateway
 * accepts for the payment, and the fee is the gateway's own addition to it.
 *
 * `0` is "no floor" and `null` is "no ceiling", which is how the payload spells both.
 */
export function gatewayAccepts(priceUsd: number, gateway: Gateway | null | undefined): boolean {
    if (!gateway || !Number.isFinite(priceUsd) || priceUsd <= 0) return false
    const min = gateway.min_payment_amount
    const max = gateway.max_payment_amount
    if (min > 0 && priceUsd < min) return false
    if (max !== null && max > 0 && priceUsd > max) return false
    return true
}

/**
 * What the gateway's fee adds **to the charged figure**, in the charged currency.
 *
 * Not `gatewayFeeUsd`: that answers in dollars, and a screen showing a 250,000 ₫ total cannot explain
 * it with a `$1.35` line. This prices the same package twice through the same conversion and the same
 * `min_unit` rounding — once with the gateway's fees and once with them zeroed — and returns the
 * difference. Both sides therefore round the same way, so the figure it gives really is
 * `total − what the package alone would have cost`, rather than a converted fee that misses the
 * total by a rounding unit.
 *
 * `null` when there is no gateway or no price yet. `0` is a real answer: a gateway with neither a
 * percentage nor a flat component charges nothing, and saying so is worth a line on a page where
 * every other method adds 15–45%.
 */
export function gatewayFeeCharge(
    priceUsd: number,
    gateway: Gateway | null | undefined,
): GatewayCharge | null {
    const total = gatewayTotal(priceUsd, gateway)
    if (!total || !gateway) return null
    const bare = gatewayTotal(priceUsd, {
        ...gateway,
        fee_percent_rate: 0,
        fee_flat_amount: 0,
    })
    if (!bare) return null
    return { ...total, amount: round(total.amount - bare.amount, 6) }
}

/**
 * A charge as one string — `$10.29`, `250,000 VND`.
 *
 * The rule is only `isSymbolFirst` plus where the space goes, but it was written out at three call
 * sites (the sheet's total, the page's total, the Pay button's label) and the three disagreed about
 * the fallback when `currencyId` is empty. Two decimals for a symbol currency, because that is what a
 * dollar amount looks like; **none forced** on a code currency, whose `min_unit` is already the
 * smallest amount it takes — `roundToUnit` has made the figure exact and `toFixed(2)` would print
 * `250000.00 VND`.
 *
 * `null` prints an em dash rather than a zero: nothing has been chosen yet, and `$0.00` is a price.
 */
export function formatCharge(charge: GatewayCharge | null | undefined): string {
    if (!charge) return '—'
    if (isSymbolFirst(charge))
        return `${charge.currencyId || USD_CURRENCY_ID}${charge.amount.toFixed(2)}`
    return `${charge.amount} ${charge.currencyId}`
}
