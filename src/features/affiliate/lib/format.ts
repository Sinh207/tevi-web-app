import { DEFAULT_CURRENCY, formatFiatAmount } from '@shared/lib/money'

/**
 * The three figures the affiliate screens render, and the rule for each when it is unknown.
 *
 * They are here rather than inline because the same figure appears on two or three screens and the
 * "what if it is missing" answer has to be the same in all of them. Legacy decides per call site and
 * disagrees with itself — the promoter count goes through a compact formatter while the referral
 * count beside it prints raw, and `estimate_income` of zero renders `--` in one place and `$0.00` in
 * another.
 */

/**
 * A money figure, or `null` when there is nothing to show.
 *
 * `null` — not `$0.00` — for an absent value, so a caller can choose its own placeholder. **Zero is
 * a real figure and formats as one**: a creator who has earned nothing should read `$0.00`, not a
 * dash that looks like the number failed to load. Legacy's `revenue ? … : '--'` collapses the two,
 * which is why a brand-new program advertises `--` instead of its estimate.
 */
export function formatAffiliateMoney(value: number | null, locale: string): string | null {
    if (value === null) return null
    return formatFiatAmount(value, DEFAULT_CURRENCY, locale)
}

/**
 * A commission rate as a bare number for interpolation into `{{rate}}%`.
 *
 * The wire sends a percentage, not a fraction — `12` means 12%. Absent becomes `0`, matching
 * legacy's `formatCommissionRate`, because a program with no stated rate still has to render a
 * badge and "0%" is at least true of what we know.
 */
export function formatCommissionRate(rate: number | null): string {
    if (rate === null) return '0'
    // Trim a trailing `.0` so `12.0` reads as `12` — the wire sends both.
    return String(Number.parseFloat(rate.toFixed(2)))
}
