/**
 * How a post says when it happened.
 *
 * ## Absolute, not relative — and that is legacy's call, not a default
 *
 * `fDateTimeSuffix` formats `MMM dd, yyyy - HH:mm`: **"Oct 09, 2025 - 14:30"**, never "2 hours ago".
 * A feed of relative stamps re-renders as it ages and tells a reader nothing about a post from last
 * March; the trade is that a post from a minute ago reads as a date rather than as *new*.
 *
 * Built on `Intl` rather than on `date-fns`, which legacy pulls in for this alone. Two consequences
 * and both are wanted: the month abbreviation comes out in the reader's own locale for all nine
 * without a locale table, and the time is **24-hour everywhere**, matching `HH:mm` rather than
 * drifting to `2:30 PM` in `en`.
 */
export function formatPostTimestamp(iso: string, locale: string): string {
    const date = new Date(iso)
    if (Number.isNaN(date.getTime())) return ''

    const day = new Intl.DateTimeFormat(locale, {
        month: 'short',
        day: '2-digit',
        year: 'numeric',
    }).format(date)

    const time = new Intl.DateTimeFormat(locale, {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
    }).format(date)

    return `${day} - ${time}`
}
