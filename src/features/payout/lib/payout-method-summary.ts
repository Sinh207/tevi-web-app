/**
 * How a saved payout method is summarised in one row — which of its method-specific fields becomes the
 * title, and which becomes the line under it.
 *
 * `payout_detail` is a bag whose keys depend on the method, so "the account this pays into" is a
 * different field for every one of them: a USDT row is identified by its wallet, a bank row by the
 * contact name over the account number, Stripe by the holder and the card's last four. Legacy holds
 * this as two `switch`es inside its row component; it is pulled out because it is the part a test can
 * actually pin, and because getting it wrong shows a creator the *wrong destination* while telling them
 * it is the right one.
 */
import type { PayoutConfigRow } from '../api/config-types'

export interface PayoutMethodSummary {
    /** The row's headline — `''` when the method carries nothing identifying. */
    title: string
    /** The line under it — `''` when there is none. */
    subtitle: string
}

/**
 * Legacy's two switches, unchanged, with one addition.
 *
 * The **fallback** is the addition: legacy's `default` title is `contact_name` and its `default`
 * subtitle is `wallet_address`, so a method with neither renders a row with no text at all — a
 * pressable blank. Here the method's own name stands in, which is the one thing every row has.
 */
export function payoutMethodSummary(row: PayoutConfigRow): PayoutMethodSummary {
    const detail = row.detail

    const title =
        row.methodSlug === 'usdt'
            ? (detail.wallet_address ?? '')
            : row.methodSlug === 'stripe'
              ? (detail.holder_name ?? '')
              : row.contactName

    const subtitle =
        row.methodSlug === 'usdt'
            ? (detail.network ?? '')
            : row.methodSlug === 'stripe'
              ? (detail.last4 ?? '')
              : row.methodSlug === 'payoneer'
                ? (detail.email ?? '')
                : row.methodSlug === 'zelle'
                  ? (detail.email_phone_number ?? '')
                  : row.methodSlug === 'bank_transfer'
                    ? (detail.account_number ?? '')
                    : (detail.wallet_address ?? '')

    /*
     * Never a blank row. When the method carries no title field — a VAI wallet saved without a contact
     * name — the identifying line is *promoted* rather than left underneath an empty headline, and the
     * method's own name is the last resort, since it is the one field every config has.
     */
    const headline = title || subtitle || row.methodName
    return {
        title: headline,
        // Never the same string twice: the promotion above would otherwise print it on both lines.
        subtitle: subtitle === headline ? '' : subtitle,
    }
}
