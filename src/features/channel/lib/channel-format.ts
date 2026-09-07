/**
 * Rendering the numbers and the date on a channel header.
 *
 * Both go through `Intl`, which is why there are no plural translation keys for the stats: a
 * count renders as `1.2K` above an unpluralised noun, exactly as the DS stat block draws it,
 * so Arabic's six plural forms never come up.
 */

/**
 * `1.2K`, `241K`, `1.4M` — locale-aware, because compact notation is not universal (`1.2K` is
 * `1,2 mil` in Portuguese and `1.2万` in Japanese, and `Intl` knows that; a hand-rolled
 * `n / 1000 + 'K'` does not).
 *
 * Guards, each for a real payload: a count below 1000 stays exact (a creator with 999
 * followers should see 999, not `1K`); a negative or non-finite value floors to `0` rather
 * than rendering `NaN` or `-5`.
 */
export function formatCompactCount(value: number | null | undefined, locale = 'en'): string {
    const count = typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : 0
    try {
        return new Intl.NumberFormat(locale, {
            notation: 'compact',
            maximumFractionDigits: 1,
        }).format(count)
    } catch {
        // An unrecognised locale tag must not take the header down.
        return new Intl.NumberFormat('en', {
            notation: 'compact',
            maximumFractionDigits: 1,
        }).format(count)
    }
}

/** The exact count, for the `title`/`aria-label` behind the compact one — `241K` is lossy. */
export function formatExactCount(value: number | null | undefined, locale = 'en'): string {
    const count = typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : 0
    try {
        return new Intl.NumberFormat(locale).format(count)
    } catch {
        return new Intl.NumberFormat('en').format(count)
    }
}

/**
 * The joined date, or `''`.
 *
 * `''` and not `'Invalid Date'`: `created_at` is a string from the API, and
 * `new Date('nonsense').toLocaleDateString()` renders those two words straight into the page.
 * An empty string lets the caller drop the whole row instead.
 *
 * ## `timeZone: 'UTC'`, and it is a correctness fix rather than a preference
 *
 * This renders inside `ChannelBio`, which is a client component and therefore **also runs on the
 * server**. Without a pinned zone it formats in whatever zone the *server process* is in, so the
 * HTML ships one date and the browser computes another: measured with the same channel, the server
 * emitted `Joined Aug 15, 2022` while a client in `America/Los_Angeles` rendered `Joined Aug 14,
 * 2022`. That is a hydration mismatch on every visitor more than a few hours from the server, and
 * with the page cached it is a wrong date served to everyone in between.
 *
 * The bug was **invisible until this week**: `created_at` arrives as epoch milliseconds and was
 * declared as text, so this function returned `''` for every channel that ever existed. Fixing the
 * schema switched it on.
 *
 * UTC is also the right answer on its own terms. A joined date is a historical fact, not an
 * appointment — nobody needs to know which side of local midnight an account was created on, and a
 * date that is stable for every reader beats one that is locally precise and disagrees with the
 * cached HTML.
 *
 * ⚠ The opposite rule applies to `formatActivityDateTime` below — see its note.
 */
const JOINED_FORMAT: Intl.DateTimeFormatOptions = {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
}

export function formatJoinedDate(value: string | null | undefined, locale = 'en'): string {
    if (!value) return ''
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return ''
    try {
        return new Intl.DateTimeFormat(locale, JOINED_FORMAT).format(date)
    } catch {
        return new Intl.DateTimeFormat('en', JOINED_FORMAT).format(date)
    }
}

/**
 * `$244` — a literal `$` in front of the locale's own number. Gated by `show_income` at the call
 * site; see B18 for whether it is owner-only on the wire.
 *
 * ## Why not `style: 'currency'`
 *
 * Because it is wrong in six of the nine locales, and the stat block is the one place that shows.
 * `Intl` formats USD the way each locale writes *foreign* money, which is not a `$` in front:
 *
 * | | `style: 'currency'` | `narrowSymbol` | here |
 * |---|---|---|---|
 * | `vi` | `244 US$` | `244 $` | `$244` |
 * | `id` | `US$244` | `$244` | `$244` |
 * | `ms` | `USD 244` | `$244` | `$244` |
 * | `ar` | `‏244 US$` | `‏244 US$` | `$244` |
 *
 * `currencyDisplay: 'narrowSymbol'` is the obvious repair and it is not enough: it drops the `US`
 * but leaves the **position**, so `vi` still trails the symbol, and `ar` ignores it outright. The DS
 * stat block draws `$244` — symbol leading, four narrow columns — and legacy agrees, building the
 * string as `` `$${formatNumberCompact(incomeUsd)}` `` rather than through a currency formatter.
 *
 * What stays localised is everything that should: the decimal separator (`$0,1` in Vietnamese) and
 * the compact magnitude (`$12,4 N`, `$1.2万`, `$12.4 ألف`). Only the currency mark is pinned, because
 * the amount is always USD no matter who is reading it.
 *
 * In RTL the `$` is a neutral leading the number, so the bidi algorithm places the pair correctly
 * without an embedding mark — same as legacy, which has shipped this in Arabic.
 */
export function formatIncomeUsd(value: number | null | undefined, locale = 'en'): string {
    const amount = typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : 0
    // No `try` of its own: `formatCompactCount` already falls back to `en` on a bad locale tag.
    return `$${formatCompactCount(amount, locale)}`
}

/**
 * A feed row's timestamp — `20 Feb 2025, 14:30`.
 *
 * ## Full date and time, because a payment is a receipt
 *
 * An earlier version showed `Feb 20` and dropped the year whenever it was the current one, on the
 * grounds that four repetitions of the same year is noise. That was the wrong trade for this list:
 * every row is somebody paying the creator money, so the row is closer to a receipt than to a
 * social timestamp, and the reader may well be reconciling it against something. Legacy agrees and
 * always did — `formatDateTime`'s default is `'MMM dd, yyyy - HH:mm'`, so the year and the clock
 * time were both there and this file had quietly dropped them.
 *
 * Still not "2 days ago". Relative time needs a live tick to stay true, a `RelativeTimeFormat` unit
 * decision per row, and it reads worse the older the row gets — this block spans months. An
 * absolute stamp is stable and does not become a lie while the tab sits open.
 *
 * ## Local time, and this one must stay client-only
 *
 * No `timeZone` here, unlike `formatJoinedDate` — and the difference is deliberate. That one is a
 * date on a profile and renders during SSR, so it is pinned to UTC to stop the server and the
 * browser disagreeing. This one is a **clock time on a receipt**: "21:30" has to mean 21:30 where
 * the reader is, or it is worse than useless for reconciling a payment.
 *
 * That is only safe because every caller is client-only — the activity feed and the Live tab both
 * render from a query with no server seed, so this never runs during SSR. **If one ever does, it
 * needs a pinned zone or a mount guard**, or it reintroduces exactly the mismatch the joined date
 * just had.
 *
 * ## `hour12: false`, pinned
 *
 * The **date** order is left to the locale, which is better than legacy's fixed pattern: Vietnamese
 * gets `20 thg 2, 2025`, English `20 Feb 2025`. The **clock** is pinned to 24-hour in all nine,
 * which is what legacy's `HH:mm` does, and it also keeps the line short — `14:30` against
 * `2:30 PM` is three characters saved on a secondary line under a display name that is already
 * competing for the width.
 */
export function formatActivityDateTime(value: string | null | undefined, locale = 'en'): string {
    if (!value) return ''
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return ''
    const options: Intl.DateTimeFormatOptions = {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
    }
    try {
        return new Intl.DateTimeFormat(locale, options).format(date)
    } catch {
        // An unrecognised locale tag must not take the feed down.
        return new Intl.DateTimeFormat('en', options).format(date)
    }
}

/**
 * `2 days ago`, `last month`, `in 3 hours` — a coarse relative stamp, localised.
 *
 * ## Why this exists when `formatActivityDateTime` deliberately refused to
 *
 * That function's note argues against relative time and the argument still holds *there*: its rows
 * are payments, the block spans months, and a receipt whose date drifts as the tab sits open is
 * worse than an absolute one. Two screens want the opposite, and for the same reason as each other
 * — the **recency is the information**. "Last activity 2 days ago" is what tells a reader whether a
 * space they follow is alive; the exact date is trivia. Legacy uses `fDistance` in both places, and
 * the DS draws the `/following` row's third line as exactly this.
 *
 * ## `numeric: 'auto'`, which is what makes it read like a sentence
 *
 * With `'always'` every value is a count — "1 day ago", "0 days ago". With `'auto'` the locales'
 * own idioms come through: `yesterday`, `last month`, `hôm qua`, `上个月`. `Intl` knows those and a
 * hand-rolled `days + ' days ago'` does not, which is the whole reason this is not arithmetic plus
 * a translation key.
 *
 * ## The unit ladder is the same one legacy's `fDistance` walks
 *
 * Seconds under a minute, then minutes, hours, days, months, years — the largest unit whose rounded
 * count is at least 1 and has not overflowed into the next one. Weeks are **skipped**:
 * `RelativeTimeFormat` supports the unit, but "3 weeks ago" and "last month" carry the same
 * information and having both makes the ladder read unevenly around the 4–5 week mark. Months are
 * 30 days and years 365, which is wrong by up to a day and a half — irrelevant at a resolution
 * whose whole point is that it is coarse.
 *
 * ## `now` is a parameter, and it must stay one
 *
 * Two reasons, one of them a correctness rule rather than a testing convenience:
 *
 * - **This must not run during SSR.** It reads the clock, so a server render and a client render
 *   minutes apart produce different text — a hydration mismatch. Every caller today is behind a
 *   client-only query with no server seed (`/following`, the channel activity feed), which is the
 *   same constraint `formatActivityDateTime` documents. A caller that *does* render on the server
 *   has to pass a fixed `now` or not use this.
 * - A default of `Date.now()` evaluated per call makes the output untestable without faking timers.
 *
 * `''` for a value that is absent or unparseable, so the caller drops the whole line rather than
 * printing `Invalid Date` — the rule `formatJoinedDate` sets.
 */
export function formatRelativeTime(
    value: string | null | undefined,
    locale = 'en',
    now: number = Date.now(),
): string {
    if (!value) return ''
    const then = new Date(value).getTime()
    if (Number.isNaN(then)) return ''

    const seconds = Math.round((then - now) / 1000)

    /**
     * The ladder, largest unit first, each with the number of seconds in it and the count at which
     * it overflows into the one above.
     *
     * The overflow check is the part that is easy to leave out, and it shows: rounding inside a
     * branch can reach the *next* unit's threshold, so a value 23.99 hours old renders
     * "24 hours ago", one 59.6 minutes old renders "60 minutes ago", and one 11.9 months old
     * renders "12 months ago". All three are reachable from a real timestamp, all three read as a
     * bug, and none of them is caught by testing a value in the middle of a branch.
     */
    const LADDER: [Intl.RelativeTimeFormatUnit, number, number][] = [
        ['year', 31_536_000, Number.POSITIVE_INFINITY],
        ['month', 2_592_000, 12],
        ['day', 86_400, 30],
        ['hour', 3600, 24],
        ['minute', 60, 60],
        ['second', 1, 60],
    ]

    let amount = seconds
    let unit: Intl.RelativeTimeFormatUnit = 'second'
    for (const [candidate, size, overflow] of LADDER) {
        const rounded = Math.round(seconds / size)
        if (Math.abs(rounded) >= 1 && Math.abs(rounded) < overflow) {
            amount = rounded
            unit = candidate
            break
        }
    }

    try {
        return new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }).format(amount, unit)
    } catch {
        // An unrecognised locale tag must not take the row down — same guard as every formatter here.
        return new Intl.RelativeTimeFormat('en', { numeric: 'auto' }).format(amount, unit)
    }
}

/** What a space's bio may show on the profile. The editor stores more; this is the preview. */
export const DESCRIPTION_MAX = 200

/**
 * The bio, cut to `DESCRIPTION_MAX` **characters as a reader counts them**.
 *
 * ## Code points, not UTF-16 units
 *
 * `String.prototype.slice` counts UTF-16 code units, so it cuts an emoji in half — a bio ending in a
 * flag or a skin-toned hand becomes a lone surrogate, which renders as `�`. `Array.from` iterates by
 * code point, so the count matches what somebody typing the bio would count. (A grapheme cluster can
 * still be more than one code point — a family emoji — so this is closer, not perfect; the failure
 * mode there is cutting a few characters early, not producing a broken glyph.)
 *
 * ## Cut at a word, and only when a word is near
 *
 * Trimming mid-word reads as a rendering fault ("passionate about pho…tography"). So the cut backs
 * up to the last space **if there is one in the last fifth of the allowance** — otherwise the text
 * is one long unbroken run (a URL, a language that does not space its words) and backing up to a
 * space three lines earlier would throw away most of the bio.
 */
export function truncateDescription(text: string, max = DESCRIPTION_MAX): string {
    const chars = Array.from(text)
    if (chars.length <= max) return text

    const cut = chars.slice(0, max).join('')
    const lastSpace = cut.lastIndexOf(' ')
    const keep = lastSpace > max * 0.8 ? cut.slice(0, lastSpace) : cut
    return `${keep.trimEnd()}…`
}
