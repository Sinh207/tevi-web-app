import type { PayoutRequestDetail } from '../api/types'

/**
 * When the money is expected to arrive — legacy's `formatPayoutRange`.
 *
 * This is the second thing a creator wants after the amount, and it is the field I left out of the
 * first pass of this screen. Legacy puts it directly under the request id, in **bold**.
 *
 * ## Two options, two different sentences
 *
 * | option | `payout_duration` means | legacy renders |
 * |---|---|---|
 * | `saving` | days | a **date range**: `created_at + d` to `created_at + d + 1`, as `MMM dd - MMM dd, yyyy` |
 * | `fast` | days | **hours**: `d × 24`, as "N hours" |
 *
 * The two are not the same shape because they are not the same promise: a saving payout lands on a day
 * nobody can name to the hour, and a fast one is a countdown. Reproduced rather than unified.
 *
 * ## The defaults are legacy's, and they are load-bearing
 *
 * `Number(payoutDuration) || 15` for saving and `|| 1` for fast. A payload with no duration still gets
 * a range rather than a blank — which is the right call for a promise about money: "about two weeks"
 * beats saying nothing. Kept, including the numbers.
 *
 * Returns `null` when there is no option or no `created_at` to count from; the caller then omits the
 * row entirely, exactly as legacy does (`{formatPayoutRange && …}`).
 */
export type PayoutEta =
    | { kind: 'range'; fromMs: number; toMs: number }
    | { kind: 'hours'; hours: number }

const DAY_MS = 86_400_000

export function payoutEta(request: PayoutRequestDetail): PayoutEta | null {
    if (!request.createdAt) return null

    switch (request.option) {
        case 'saving': {
            const days = request.optionDuration || 15
            return {
                kind: 'range',
                fromMs: request.createdAt + days * DAY_MS,
                // `+ 1 day`, so the range is a window rather than a point — legacy's own `addDays(d)`
                // to `addDays(d + 1)`.
                toMs: request.createdAt + (days + 1) * DAY_MS,
            }
        }
        case 'fast':
            return { kind: 'hours', hours: (request.optionDuration || 1) * 24 }
        default:
            // An option this client does not know states no duration it can trust.
            return null
    }
}

/**
 * The range as one string — `Feb 27 - Feb 28, 2025`.
 *
 * `Intl.DateTimeFormat.formatRange` does this properly in every locale: it collapses the shared parts
 * itself (so an in-month range reads `Feb 27 – 28, 2025` in English and follows each locale's own
 * convention elsewhere), and it puts the separator where that language puts it. Legacy composes the
 * string by hand from two `format` calls with a literal `-` between them, which is correct for English
 * and wrong for every locale that orders or separates dates differently.
 *
 * Falls back to `en` on an unsupported locale tag, the same guard every formatter in
 * `shared/lib/ledger-time.ts` carries.
 */
export function formatPayoutEtaRange(fromMs: number, toMs: number, locale = 'en'): string {
    const options: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' }
    try {
        return new Intl.DateTimeFormat(locale, options).formatRange(
            new Date(fromMs),
            new Date(toMs),
        )
    } catch {
        return new Intl.DateTimeFormat('en', options).formatRange(new Date(fromMs), new Date(toMs))
    }
}
