import type { TranslationKey } from '@shared/i18n/settings'
import type { PayoutFee, PayoutRequestDetail } from '../api/types'

/**
 * The fee breakdown a payout's detail screen prints, and the arithmetic behind it.
 *
 * ## Why the rate and the charge are two different numbers
 *
 * A fee states a **rate** ("1 USD + 5%") and carries a **charge** (6 TEVI). When the fee is waived the
 * rate still stands and the charge is zero — see `PayoutFee.isWaived`, and the `original` field it
 * comes from. Printing only the charge would tell a creator whose fee was waived that the fee does not
 * exist; printing only the rate would leave them to multiply. So a row is *rate · charge*, and a
 * waived one says so.
 *
 * ## The charge is converted with the **method's** rate, not the request's
 *
 * `fee_details[].subtotal.amount` is in `amount_currency` while everything else on the screen is in the
 * settlement currency, so it is multiplied out. The rate is
 * `payout_config.payout_method.exchange_rate` — **not** the request's root `exchange_rate`. The two are
 * different numbers (`25457.6849` and `25622.3426` in the live payload) and legacy is explicit:
 * everything it computes uses the method's rate, while the **net** figure arrives already converted at
 * the root one. Using the root rate here printed `-1,281,117` where the screen should read
 * `-1,272,884`.
 *
 * **A missing rate is `null`, never `1`.** A rate of 1 quietly reports TEVI figures as settlement
 * figures, which on a VND payout is wrong by four orders of magnitude. Without one the row shows the
 * charge unconverted and the caller prints its own unit — see `convertedCharge`.
 */
export interface PayoutFeeLine {
    /** `payout_fee` · `payout_transaction_fee` · `payout_option_fee`. */
    type: PayoutFee['type']
    /**
     * The stated rate, formatted — `1 + 5%`, `5%`, `1`, or `null` when the fee states neither.
     *
     * The pieces are numbers rather than a sentence: the label around them ("Withdraw fee: …") is a
     * translation key, and building it here would put English in a lib.
     */
    flatAmount: number
    percentRate: number
    /** `true` when neither component is set — legacy prints `---` for this. */
    hasNoRate: boolean
    /** The charge in the **settlement** currency, or `null` when there is no rate to convert with. */
    convertedCharge: number | null
    /** The charge as billy quoted it, in `amountCurrency`. */
    rawCharge: number | null
    isWaived: boolean
}

/** Two decimals, the way legacy rounds a converted fee (`roundToTwo`). */
function roundToTwo(value: number): number {
    return Math.round((value + Number.EPSILON) * 100) / 100
}

/** The rate legacy computes with: the **method's**, rounded to two before it multiplies anything. */
export function payoutComputeRate(request: PayoutRequestDetail): number | null {
    const rate = request.config?.methodExchangeRate ?? null
    return rate !== null && rate > 0 ? rate : null
}

/**
 * `amount × rate` — what the gross is worth in the settlement currency before fees.
 *
 * Legacy's `Sub-Receive amount`, and a row I left out: without it the breakdown jumps from a figure in
 * one currency to two deductions in another, and the reader has no line to subtract them from.
 */
export function payoutSubReceive(request: PayoutRequestDetail): number | null {
    const rate = payoutComputeRate(request)
    if (rate === null || request.amount === null) return null
    return roundToTwo(request.amount * rate)
}

export function payoutFeeLines(request: PayoutRequestDetail): PayoutFeeLine[] {
    const rate = payoutComputeRate(request)
    return request.fees.map(fee => ({
        type: fee.type,
        flatAmount: fee.flatAmount,
        percentRate: fee.percentRate,
        hasNoRate: fee.flatAmount <= 0 && fee.percentRate <= 0,
        convertedCharge:
            fee.charged !== null && rate !== null ? roundToTwo(fee.charged * rate) : null,
        rawCharge: fee.charged,
        isWaived: fee.isWaived,
    }))
}

/**
 * The translation key for a fee's label.
 *
 * Legacy's own three, from `withdraw_request_w2_*` — the *request* screen's namespace, which the detail
 * screen borrows. Kept as legacy's keys rather than new ones so the two screens cannot drift once the
 * request flow lands.
 *
 * `null` for a type this client does not know, and the caller then falls back to billy's own slug.
 * Legacy renders nothing at all for an unlisted fee, which quietly hides a charge from the breakdown —
 * on a screen whose whole job is to account for the difference between gross and net.
 */
/**
 * The three fees, in the order a breakdown prints them.
 *
 * Legacy builds a fixed three-item array on both screens rather than walking the payload, and it is
 * right to: the wire order is the backend's, and a breakdown whose rows move between two withdrawals
 * is one nobody can scan. Exported so the request summary walks the same list — it had its own copy.
 */
export const PAYOUT_FEE_ORDER = [
    'payout_fee',
    'payout_transaction_fee',
    'payout_option_fee',
] as const

const FEE_LABELS: Record<string, TranslationKey> = {
    payout_fee: 'payout_fee_withdraw',
    payout_transaction_fee: 'payout_fee_transaction',
    payout_option_fee: 'payout_fee_option',
}

export function payoutFeeLabel(type: string): TranslationKey | null {
    return FEE_LABELS[type] ?? null
}
