/**
 * The one date the members list prints — when a member's current term ends.
 *
 * ## A second copy of `features/membership/lib/membership-date.ts`, deliberately
 *
 * The two features answer the same question from opposite sides — *"when am I next charged"* there,
 * *"when is this member next charged"* here — and the formatting decision is identical. It is
 * duplicated rather than shared for the plain reason the boundary rules give: a feature may not
 * import another feature's `lib/`, and a three-line `Intl` call is not worth widening a barrel for.
 * Same call `MONETIZATION_CONTAINER` makes about a layout constant.
 *
 * Both decisions carry over, and both are written down there in full:
 *
 * - **Local time, not UTC.** This is a date in the future that somebody is checking against their own
 *   calendar, so a value a day off is wrong about the thing they came to read. The panel is
 *   client-only (there is no SSR bearer), so no cached HTML can disagree.
 * - **Three parts, no pattern.** Legacy hardcodes `MMM dd, yyyy`, which is US order in all nineteen
 *   of its locales. `Intl` with day/short-month/year gives each locale its own arrangement —
 *   `01 Sep 2026`, `01 thg 9, 2026`, `2026年9月1日`.
 *
 * A value that will not parse returns `''`, which the row reads as "drop the line".
 */
const DATE_FORMAT: Intl.DateTimeFormatOptions = {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
}

export function formatMemberDate(value: string | null | undefined, locale = 'en'): string {
    if (!value) return ''
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return ''
    try {
        return new Intl.DateTimeFormat(locale, DATE_FORMAT).format(date)
    } catch {
        // An unsupported locale tag must not take the row down.
        return new Intl.DateTimeFormat('en', DATE_FORMAT).format(date)
    }
}
