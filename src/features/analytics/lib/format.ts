/**
 * Rendering the dashboard's numbers and dates.
 *
 * ## The totals are the **backend's** strings, and only the chart's numbers are formatted here
 *
 * `channel/stats/` sends every headline figure pre-formatted (`display`, `prev_display`) along
 * with the parts needed to format the raw points (`currency_display`, `is_integer`). So the big
 * number on a tab is printed verbatim and this file only exists for the values the client has to
 * render itself: the chart's axis ticks, its tooltip, and the percentage.
 *
 * That split is deliberate rather than lazy. The backend knows the account's currency and its
 * decimal digits; the client does not (`features/earnings` documents the same gap — there is no
 * wallet in this app yet). Re-formatting `display` from a raw number would mean inventing a
 * symbol, and a dashboard whose tab says `$1,204.30` while its tooltip says `1.204,30 US$` is
 * worse than one that simply repeats what the server said.
 */

/**
 * A chart value, in the tooltip and down the axis — `$1,204.30`, `$1.2K`, `241`, `1.2K`.
 *
 * Ported from legacy's `formatValue`, thresholds included, because the axis and the tooltip have to
 * agree with the tab's server-rendered `display` and legacy's choices are what the server matches:
 *
 * - **≥ 1000 goes compact** (`$1.2K`), because the axis is 50px wide and `$1,204.30` does not fit.
 * - **Below 1000 a currency keeps two decimals** (`$4.20`), so a column of small amounts aligns.
 * - **A count is rounded** — `is_integer` metrics are followers and sessions, and `3.5 sessions`
 *   is not a thing that happened.
 *
 * `currencyDisplay` is the symbol the backend sent, prepended verbatim. It is *leading* in all nine
 * locales because that is what the design draws and what `display` already did — the same pinning
 * `formatEarningsAmount` explains at length. Only the separators are the reader's own.
 *
 * An unrecognised locale tag falls back to `en` rather than throwing: `Intl` rejects a malformed
 * tag, and a bad tag must not take a chart's axis down.
 */
export function formatMetricValue(
    value: number | null | undefined,
    { currencyDisplay = '', isInteger = false }: { currencyDisplay?: string; isInteger?: boolean },
    locale = 'en',
): string {
    const amount = typeof value === 'number' && Number.isFinite(value) ? value : 0
    const compact = Math.abs(amount) >= 1000

    /*
     * Three shapes, in order of precedence:
     *
     * - **compact** for anything in the thousands, so a 52px axis label fits;
     * - **two decimals** for money below that, so a column of small amounts aligns;
     * - **whole numbers** for a count (`is_integer`), because `3.5 sessions` is not a thing that
     *   happened — and up to two decimals for a non-integer, non-currency metric, which is the one
     *   case legacy rounds away (it ignores the flag and rounds everything without a symbol).
     */
    const options: Intl.NumberFormatOptions = compact
        ? { notation: 'compact', maximumFractionDigits: 1 }
        : currencyDisplay
          ? { minimumFractionDigits: 2, maximumFractionDigits: 2 }
          : { maximumFractionDigits: isInteger ? 0 : 2 }

    let formatted: string
    try {
        formatted = new Intl.NumberFormat(locale, options).format(amount)
    } catch {
        formatted = new Intl.NumberFormat('en', options).format(amount)
    }
    return `${currencyDisplay}${formatted}`
}

/**
 * The same value on an **axis tick** — `$800`, `$1.2K`, `241`.
 *
 * Separate from `formatMetricValue` because the axis and the tooltip want different things from the
 * same number, and mixing them is visible: ticks are multiples of a nice step, so a money axis came
 * out as `$1.4K · $1.2K · $1K · $800.00 · $600.00` — two formats down one column, which reads as a
 * rendering bug rather than as a scale. The tooltip still keeps its cents, because there the value is
 * a figure being *read*, not a gridline being labelled.
 *
 * So: a whole number loses its decimals, and a fractional tick (possible on a small non-integer
 * domain — an axis running 0 · 0.5 · 1) keeps up to two.
 */
export function formatAxisValue(
    value: number,
    { currencyDisplay = '', isInteger = false }: { currencyDisplay?: string; isInteger?: boolean },
    locale = 'en',
): string {
    const amount = Number.isFinite(value) ? value : 0
    // In the thousands the two formatters agree — compact is compact — so the shared one is used and
    // there is one place that decides what `1.2K` looks like.
    if (Math.abs(amount) >= 1000) {
        return formatMetricValue(amount, { currencyDisplay, isInteger }, locale)
    }
    const options: Intl.NumberFormatOptions = {
        maximumFractionDigits: Number.isInteger(amount) || isInteger ? 0 : 2,
    }
    let formatted: string
    try {
        formatted = new Intl.NumberFormat(locale, options).format(amount)
    } catch {
        formatted = new Intl.NumberFormat('en', options).format(amount)
    }
    return `${currencyDisplay}${formatted}`
}

/**
 * The change against the previous period — `12.5%`, `100%`, `0%`.
 *
 * **Unsigned on purpose.** The direction is carried by an arrow and a colour beside it, so a `-` in
 * the string would say it twice and, next to a red down-arrow, read as a double negative. The
 * caller decides the arrow from the sign of the raw number.
 *
 * Trailing zeros are trimmed (`100.00%` → `100%`, `83.30%` → `83.3%`) and two decimals is the cap:
 * the backend sends this to eight places and `74.24999999%` is noise on a dashboard.
 */
export function formatPercentChange(percent: number | null | undefined): string {
    const value = typeof percent === 'number' && Number.isFinite(percent) ? Math.abs(percent) : 0
    const text = value % 1 === 0 ? value.toFixed(0) : value.toFixed(2).replace(/\.?0+$/, '')
    return `${text}%`
}

/**
 * One bucket's label on the X axis and in the tooltip — `Feb 19` for daily and weekly buckets,
 * `2:00 PM` for hourly ones.
 *
 * The bucket size decides the format because the alternative is a chart of 24 identical labels: on
 * the `yesterday` period every point is the same date and only the hour distinguishes them, while
 * on a 90-day period every point is a different week and the hour is always midnight.
 *
 * **Local zone**, matching the range boundaries (`lib/periods.ts`) and the caption on the screen —
 * so, like them, not safe to render during SSR. `DashboardAnalyticsView` waits for mount.
 */
export function formatBucketLabel(
    timestampMs: number | null | undefined,
    hourInterval: number,
    locale = 'en',
): string {
    if (typeof timestampMs !== 'number' || !Number.isFinite(timestampMs)) return ''
    const date = new Date(timestampMs)
    if (Number.isNaN(date.getTime())) return ''
    const options: Intl.DateTimeFormatOptions =
        hourInterval >= 24
            ? { month: 'short', day: 'numeric' }
            : { hour: 'numeric', minute: '2-digit' }
    try {
        return new Intl.DateTimeFormat(locale, options).format(date)
    } catch {
        return new Intl.DateTimeFormat('en', options).format(date)
    }
}

/**
 * A range, as the summary card prints it — `19 February – 20 March`, with the year on both ends
 * only when they differ.
 *
 * The year is dropped in the common case because both dates are almost always in the current one
 * and `19 February 2025 – 20 March 2025` spends half a line saying so twice. It comes back the
 * moment a range straddles New Year, which is exactly when the reader needs it — legacy makes the
 * same call.
 *
 * The dash is an **en dash with hyphen-free spacing** rather than `-`: this is a range, and a
 * hyphen between two dates reads as one compound date.
 */
export function formatRangeLabel(range: { startMs: number; endMs: number }, locale = 'en'): string {
    const start = new Date(range.startMs)
    const end = new Date(range.endMs)
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return ''
    const sameYear = start.getFullYear() === end.getFullYear()
    const options: Intl.DateTimeFormatOptions = {
        day: 'numeric',
        month: 'long',
        ...(sameYear ? {} : { year: 'numeric' }),
    }
    const format = (date: Date) => {
        try {
            return new Intl.DateTimeFormat(locale, options).format(date)
        } catch {
            return new Intl.DateTimeFormat('en', options).format(date)
        }
    }
    return `${format(start)} – ${format(end)}`
}

/**
 * When a top-earning item was published — `19 Feb 2025, 14:32`.
 *
 * A **moment**, not a bucket, so it is rendered in the reader's own zone for the reason
 * `shared/lib/ledger-time.ts` gives about a transaction row: the useful reading of an instant is
 * the clock the reader was living on. Not shared *with* that module because this list is not a
 * ledger and pulling a `shared/lib` dependency in for one `Intl` call would tie two screens'
 * formats together for no reason — but if a third screen wants it, that is where it goes.
 */
const ITEM_TIME_FORMAT: Intl.DateTimeFormatOptions = {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
}

export function formatItemTime(timestampMs: number | null | undefined, locale = 'en'): string {
    if (typeof timestampMs !== 'number' || !Number.isFinite(timestampMs)) return ''
    const date = new Date(timestampMs)
    if (Number.isNaN(date.getTime())) return ''
    try {
        return new Intl.DateTimeFormat(locale, ITEM_TIME_FORMAT).format(date)
    } catch {
        return new Intl.DateTimeFormat('en', ITEM_TIME_FORMAT).format(date)
    }
}
