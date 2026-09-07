/**
 * A notification's age, as a short localised phrase — `2 hours ago`, `Yesterday`, `20 Feb`.
 *
 * ## Why relative here, when the ledger screens are absolute
 *
 * `channel-format.ts`'s `formatActivityDateTime` argues *against* relative time, and it is right
 * for what it formats: a payment row is closer to a receipt than to a social timestamp, the reader
 * may be reconciling it, and "2 days ago" reads worse the older a row gets.
 *
 * An inbox is the opposite case on all three counts. Every row is an event that just happened —
 * the list is newest-first and the top of it is minutes old — what the reader wants is *how
 * recent*, not *when exactly*, and legacy agrees (`fDistance(created_at, Date.now(), …,
 * { addSuffix: true })`). So the two formatters disagree because their content does, not because
 * nobody checked.
 *
 * ## …but only for the first week
 *
 * Past a week this switches to an absolute short date, and that is the part legacy is missing: its
 * `fDistance` keeps counting, so a two-month-old notification says "about 2 months ago" and a
 * year-old one "about 1 year ago" — phrases that carry less information than the date they
 * replaced, and that get *vaguer* the more precision the reader would want. Seven days is where
 * the number of units stops being small: within it every answer is minutes, hours or days.
 *
 * ## `Intl`, and the pinned locale
 *
 * `Intl.RelativeTimeFormat` with `numeric: 'auto'`, which is what turns `-1 day` into
 * "yesterday" in every locale that has such a word — the reason not to assemble the phrase from a
 * translation key and a number. An unrecognised locale tag falls back to `en` rather than throwing:
 * a formatter must not be able to take a list down.
 *
 * ⚠ **Client-only, by construction.** It reads `Date.now()`, so a server render and the hydration
 * that follows it would disagree by however long the response took, and React would report a
 * mismatch on every row. The whole inbox is client code — there is no SSR bearer in this app, so
 * the list cannot render on the server anyway — but if a notification ever needs to be printed
 * during SSR, it needs the absolute form or a mount guard.
 */

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

/** Past this, the phrase stops being useful and the date takes over. See the note above. */
const RELATIVE_WINDOW = 7 * DAY

function relativeFormatter(locale: string): Intl.RelativeTimeFormat {
    try {
        return new Intl.RelativeTimeFormat(locale, { numeric: 'auto', style: 'short' })
    } catch {
        return new Intl.RelativeTimeFormat('en', { numeric: 'auto', style: 'short' })
    }
}

function shortDate(date: Date, locale: string): string {
    /*
     * The year only when it is not the current one. Unlike the ledger's stamp — where the year is
     * always printed because the row is a receipt — this line sits beside a title on a 390px phone
     * and is competing for the width, and every row of a week-old notification would repeat the
     * same four characters.
     */
    const options: Intl.DateTimeFormatOptions =
        date.getFullYear() === new Date().getFullYear()
            ? { day: 'numeric', month: 'short' }
            : { day: 'numeric', month: 'short', year: 'numeric' }
    try {
        return new Intl.DateTimeFormat(locale, options).format(date)
    } catch {
        return new Intl.DateTimeFormat('en', options).format(date)
    }
}

/**
 * The phrase for one notification's `created_at`, or `''` when there is no usable timestamp.
 *
 * `''` and not a placeholder: the row drops the whole time element when this is empty, which is
 * better than printing "Invalid Date" or a dash the reader has to interpret.
 *
 * `now` is a parameter so the behaviour can be pinned by a test without freezing the clock — the
 * default is the only value any caller passes.
 */
export function formatInboxTime(
    value: string | null | undefined,
    locale = 'en',
    now: number = Date.now(),
): string {
    if (!value) return ''
    const date = new Date(value)
    const time = date.getTime()
    if (Number.isNaN(time)) return ''

    const elapsed = now - time

    if (elapsed >= RELATIVE_WINDOW) return shortDate(date, locale)

    const format = relativeFormatter(locale)

    /*
     * A timestamp in the **future** reads as "now", and is never counted forwards.
     *
     * A notification cannot be delivered before it exists, so a future `created_at` is always a
     * clock disagreement — the device's is behind the server's, or a service stamped in the wrong
     * zone — and never a scheduled event. "in 3 hours" on something already sitting in the inbox
     * reads as a bug in the app rather than as a wrong clock, and it would sort visibly against
     * the rows around it.
     *
     * This is the branch the `< MINUTE` comparison below already produced for a negative
     * `elapsed`; it is written out because the behaviour is a decision and not a side effect of
     * comparing a negative number against a positive one. An earlier version guarded only the
     * first minute of skew and left the rest to fall through here, which meant the honest-looking
     * condition and the actual behaviour disagreed.
     *
     * Below it, the negative values are because `RelativeTimeFormat` counts *forwards*: `-2, 'hour'` is "2 hours
     * ago" and `2, 'hour'` is "in 2 hours". Rounded down at each step, so 119 minutes is "1 hour
     * ago" and not "2 hours ago" — a notification must never claim to be older than it is, or a
     * reader comparing two rows gets the order wrong.
     */
    if (elapsed < MINUTE) return format.format(0, 'minute')
    if (elapsed < HOUR) return format.format(-Math.floor(elapsed / MINUTE), 'minute')
    if (elapsed < DAY) return format.format(-Math.floor(elapsed / HOUR), 'hour')
    return format.format(-Math.floor(elapsed / DAY), 'day')
}
