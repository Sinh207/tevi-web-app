/**
 * The date and the clock on an event page.
 *
 * ## Two lines, because they answer two questions
 *
 * Legacy prints `MMM d, yyyy` over `HH:mm` in a two-line block beside a calendar tile, and the split
 * is right: *which day* and *what time* are read separately, and a single run of
 * `Feb 20, 2026, 14:30` makes the reader parse the whole string to find either. So this exports the
 * halves rather than one combined string.
 *
 * ## Local time, and it is **not** pinned to UTC
 *
 * The opposite decision from `formatJoinedDate` in `features/channel`, and deliberately: a joined
 * date is a historical fact, where a zone that is stable for every reader beats one that is locally
 * precise. A livestream's start time is an **appointment**. `21:30` has to mean 21:30 where the
 * reader is or the page is worse than useless — it is the one number somebody might set an alarm by.
 *
 * ⚠ **Which makes every caller a hydration hazard, and the callers deal with it.** This page is
 * server-rendered (see `event-server-api.ts`), so the HTML carries the *server process's* zone and
 * the browser then computes the reader's. `EventSchedule` marks the element
 * `suppressHydrationWarning` and pairs the text with a machine-readable `dateTime` on a `<time>`,
 * which is the standard answer for locale- and zone-dependent text and is why the mismatch is
 * declared rather than papered over. Do not "fix" it by pinning a zone here.
 *
 * ## `hour12: false`, pinned
 *
 * The **date** order is left to the locale — `20 thg 2, 2026` in Vietnamese, `Feb 20, 2026` in
 * English — which is better than legacy's fixed pattern. The **clock** is 24-hour in all nine, which
 * is what legacy's `HH:mm` does and what keeps the line short: `14:30` against `2:30 PM`.
 */

const DATE_FORMAT: Intl.DateTimeFormatOptions = {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
}

const TIME_FORMAT: Intl.DateTimeFormatOptions = {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
}

/**
 * `''` and never `'Invalid Date'` — those two words render straight into the page, and the caller
 * drops the whole row on an empty string. `eventDetailSchema` already normalises the wire's epoch
 * numbers to ISO, so a value reaching here unparseable is a payload this client has not seen.
 */
function format(
    value: string | null | undefined,
    locale: string,
    options: Intl.DateTimeFormatOptions,
) {
    if (!value) return ''
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return ''
    try {
        return new Intl.DateTimeFormat(locale, options).format(date)
    } catch {
        // An unrecognised locale tag must not take the page down.
        return new Intl.DateTimeFormat('en', options).format(date)
    }
}

export function formatEventDate(value: string | null | undefined, locale = 'en'): string {
    return format(value, locale, DATE_FORMAT)
}

export function formatEventTime(value: string | null | undefined, locale = 'en'): string {
    return format(value, locale, TIME_FORMAT)
}

/**
 * One line, for a place with no room for two — the `<meta name="description">` and the share
 * preview, which is where legacy uses its combined form (`convertTZ(start_at)`).
 *
 * `''` when there is no usable date, so the caller can leave the sentence out rather than opening it
 * with a comma.
 */
export function formatEventDateTime(value: string | null | undefined, locale = 'en'): string {
    return format(value, locale, { ...DATE_FORMAT, ...TIME_FORMAT })
}
