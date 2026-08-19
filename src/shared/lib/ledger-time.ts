/**
 * Timestamps in a ledger — the row's moment, and the month it groups under.
 *
 * `shared/lib` for the same reason `money.ts` is: `/my-star` and `/my-wallet` are independent
 * features and both render a ledger, so neither can own the other's date formatting. Pure functions
 * over a number.
 */

/**
 * A row's timestamp — `19 Feb 2025, 14:32` in the reader's own locale order and **own zone**.
 *
 * ## Local time here, UTC on the earnings report — and both are correct
 *
 * `formatEarningsDate` pins UTC because a row there is a *calendar day the server bucketed*, so
 * re-interpreting it in the reader's zone shifts the label off the day the amounts belong to. A row
 * here is the opposite: a **moment**, the instant a transaction happened. The only useful rendering
 * of a moment is in the zone the reader was living in when it happened — "did I really spend that at
 * 2am" is a question only local time answers.
 *
 * The cost is that this is **not safe to render during SSR**: the server's zone is not the reader's,
 * so the two would disagree and React would report a hydration mismatch. That is fine and is not a
 * latent trap — a ledger is bearer-derived and this app has no SSR bearer by construction, so nothing
 * that calls this is produced anywhere but the browser.
 *
 * `''` for an unparseable value rather than `Invalid Date`, so the caller can drop the line.
 */
const DATE_TIME_FORMAT: Intl.DateTimeFormatOptions = {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
}

export function formatLedgerDateTime(value: number | null | undefined, locale = 'en'): string {
    if (typeof value !== 'number' || !Number.isFinite(value)) return ''
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return ''
    try {
        return new Intl.DateTimeFormat(locale, DATE_TIME_FORMAT).format(date)
    } catch {
        return new Intl.DateTimeFormat('en', DATE_TIME_FORMAT).format(date)
    }
}

/**
 * The month a row is grouped under — `February 2025`.
 *
 * Legacy groups its ledgers by month with a sticky header per group, and it is worth keeping: a
 * paginated ledger with no dividers is an undifferentiated wall once the second page lands.
 *
 * This is only the **label**. The bucket's identity is `ledgerMonthKey` below — two locales produce
 * two different strings for the same month, so keying the groups on this would re-bucket the whole
 * list on a language switch.
 */
const MONTH_FORMAT: Intl.DateTimeFormatOptions = { month: 'long', year: 'numeric' }

export function formatLedgerMonth(value: number, locale = 'en'): string {
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return ''
    try {
        return new Intl.DateTimeFormat(locale, MONTH_FORMAT).format(date)
    } catch {
        return new Intl.DateTimeFormat('en', MONTH_FORMAT).format(date)
    }
}

/**
 * The stable identity of a row's month bucket — `2025-02`.
 *
 * Locale-independent by construction, and computed in **local** time to match
 * `formatLedgerDateTime`: a transaction shown as `1 Mar, 00:30` must group under March, which it
 * would not if the key were derived from its UTC month.
 */
export function ledgerMonthKey(value: number): string {
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return ''
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}
