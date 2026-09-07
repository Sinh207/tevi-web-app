/**
 * The one date this screen prints — a term's end, read as either the next charge or the last day.
 *
 * ## Local time, not UTC — the opposite call to `formatJoinedDate`
 *
 * `features/channel`'s joined date is deliberately UTC: a historical fact nobody needs to place
 * against local midnight, and one whose stability matters because it is server-rendered. This is
 * neither. It is a date in the reader's **future**, and the question they are answering is "when will
 * my card be charged" — so a value that lands a day off their own calendar is wrong about the thing
 * they came here to check. The panel is client-only (there is no SSR bearer in this app), so no
 * cached HTML can disagree with it.
 *
 * ## Day / short month / year, in the reader's own order
 *
 * Legacy hardcodes `MMM d, yyyy`, which is US order in all nineteen of its locales. `Intl` with the
 * three parts and no pattern gives `01 Sep 2026`, `01 thg 9, 2026`, `2026年9月1日` — the same three
 * facts, each locale's own arrangement. `2-digit` day matches `formatJoinedDate`, so the two dates in
 * this app do not disagree about padding.
 *
 * A value that will not parse returns `''`, which the row reads as "drop the line" — the same
 * contract `formatJoinedDate` has, and the reason no call site needs a guard.
 */
const DATE_FORMAT: Intl.DateTimeFormatOptions = {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
}

export function formatMembershipDate(value: string | null | undefined, locale = 'en'): string {
    if (!value) return ''
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return ''
    try {
        return new Intl.DateTimeFormat(locale, DATE_FORMAT).format(date)
    } catch {
        // An unsupported locale tag must not take the row down — same fallback as `formatJoinedDate`.
        return new Intl.DateTimeFormat('en', DATE_FORMAT).format(date)
    }
}

/**
 * Whether this membership's `end_date` is a **charge** date or an **end** date.
 *
 * ## One function because two surfaces disagreed
 *
 * The row branched on `canceled_at` alone while the detail dialog branched on
 * `canceled_at || status === 'expired'`, so the ordinary expired shape — a lapsed term or a failed
 * renewal, where nobody pressed cancel and `canceled_at` is `null` — printed a **past** date as
 * "Next charge" in the list and "Expiry date" in the dialog opened from that same row. Telling
 * somebody they are about to be billed for a membership that has already ended is the expensive half.
 *
 * `true` ⇒ the date is when it ends (or ended). `false` ⇒ it is the next charge.
 */
export function isMembershipEnding(membership: {
    canceled_at: string | null
    status: string | null
}): boolean {
    return membership.canceled_at !== null || membership.status === 'expired'
}
