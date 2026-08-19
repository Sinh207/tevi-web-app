/**
 * Rendering money and dates on the earnings report.
 *
 * Both are separate from `features/channel/lib/channel-format.ts` on purpose, and it is not a
 * boundary technicality — the two screens want opposite things from the same values:
 *
 * | | channel header | here |
 * |---|---|---|
 * | money | `$12.4K` — a headline, compact | `$12,412.50` — a receipt, exact |
 * | date | joined date, one per page | one per row, aligned down a column |
 *
 * `formatIncomeUsd` is compact by design (`241K` in four columns under a cover photo). Rounding a
 * payout report to `$12.4K` would make it unusable for the thing creators actually do with this
 * screen, which is reconcile it against what landed in their wallet.
 */

/**
 * `$1,234.56` — the locale's own number with a **pinned** `$`.
 *
 * ## Why not `Intl.NumberFormat(locale, { style: 'currency' })`
 *
 * The long version is in `formatIncomeUsd`'s doc and it applies verbatim: `Intl` formats USD the
 * way each locale writes *foreign* money, so Vietnamese gets `1.234,56 US$`, Malay `USD 1,234.56`
 * and Arabic `‏1,234.56 US$`. `currencyDisplay: 'narrowSymbol'` drops the `US` but keeps the
 * position. The design draws `$` leading in all nine locales, legacy builds the string the same
 * way, and the amount is USD no matter who is reading it — so only the mark is pinned and the
 * separators stay the reader's own.
 *
 * ## Always two decimal places
 *
 * Even for `$0`, which renders `$0.00`. A column of amounts where some have cents and some do not
 * does not align, and this is a column read vertically. Legacy passes the wallet currency's
 * `decimal_digits` here; there is no wallet in this app yet, so USD's 2 is the constant — see the
 * note below.
 *
 * ## ⚠ USD only, and that is a **known gap**, not a decision
 *
 * Legacy multiplies every figure by `exchangeRate` from the balance context and formats it in the
 * creator's selected wallet currency. This app has no wallet feature yet, so there is no exchange
 * rate to apply and no selected currency to apply it in — rendering the raw figure with a
 * fabricated symbol would be the worst of both. So it is USD, which is the unit the API is
 * believed to answer in (B29), and the currency switcher lands with the wallet.
 *
 * A negative amount keeps its sign (`-$4.20`, via `Intl`'s own minus placement on the number).
 * Refunds and chargebacks are real, and clamping them to `0` — which `formatIncomeUsd` does,
 * correctly, for a lifetime-income headline — would hide the one row a creator most wants to ask
 * about.
 */
const MONEY_FORMAT: Intl.NumberFormatOptions = {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
}

export function formatEarningsAmount(value: number | null | undefined, locale = 'en'): string {
    const amount = typeof value === 'number' && Number.isFinite(value) ? value : 0
    let formatted: string
    try {
        formatted = new Intl.NumberFormat(locale, MONEY_FORMAT).format(Math.abs(amount))
    } catch {
        // An unrecognised locale tag must not take a money column down.
        formatted = new Intl.NumberFormat('en', MONEY_FORMAT).format(Math.abs(amount))
    }
    return amount < 0 ? `-$${formatted}` : `$${formatted}`
}

/**
 * The day a row covers — `Feb 19, 2025` in English, in the reader's own locale order.
 *
 * ## `timeZone: 'UTC'`, and this one is a correctness fix
 *
 * A row here is a **calendar day the server bucketed**, not a moment. Formatting it in the
 * reader's zone re-interprets that bucket: a creator in `Asia/Ho_Chi_Minh` (UTC+7) reading a
 * bucket stamped at midnight UTC sees the right date, but one in `America/Los_Angeles` (UTC−8)
 * sees the day *before* — every row, silently, with the amounts still right. Two rows can even
 * come out with the same label.
 *
 * Pinning UTC makes the label stable for every reader and matches the bucket the backend built,
 * on the reading that the bucket boundary is UTC midnight (B30). Legacy does not pin it and has
 * this bug.
 *
 * It is also what keeps this safe to render during SSR, should the screen ever get a server seed
 * — the same trap `formatJoinedDate` documents and `formatActivityDateTime` deliberately accepts.
 *
 * No time of day, unlike the activity feed: the value has none to show. A daily bucket rendered
 * as `20 Feb 2025, 00:00` claims a precision the number does not carry.
 *
 * `''` for an unparseable value rather than `Invalid Date`, so the caller can drop the row.
 */
const DATE_FORMAT: Intl.DateTimeFormatOptions = {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
}

export function formatEarningsDate(value: number | null | undefined, locale = 'en'): string {
    if (typeof value !== 'number' || !Number.isFinite(value)) return ''
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return ''
    try {
        return new Intl.DateTimeFormat(locale, DATE_FORMAT).format(date)
    } catch {
        return new Intl.DateTimeFormat('en', DATE_FORMAT).format(date)
    }
}

/**
 * The `[dateTs]` URL segment ↔ a row's `date`.
 *
 * **The URL is in seconds and the API is in milliseconds.** That is legacy's contract, inferred
 * from the one comparison it makes (`Math.floor(item.date / 1000) === Number(dateTs)`), and it is
 * kept verbatim because links to these URLs exist outside this repo — the mobile apps deep-link
 * into a specific day, and the cutover is same-origin.
 *
 * So the pair below is the only place the two units meet, and neither side gets to be casual
 * about it: `parseEarningsDateParam` returns **seconds** and the matcher does the division, which
 * keeps the conversion in one function instead of at every comparison.
 *
 * `null` for anything that is not a positive integer — the segment comes straight off the path,
 * so `/@ada/earnings-report/'; DROP` is a URL somebody will try. A `null` simply means no row is
 * pre-expanded, which is the same as visiting the parent route.
 */
export function parseEarningsDateParam(param: string | undefined | null): number | null {
    if (typeof param !== 'string') return null
    let decoded = param.trim()
    try {
        decoded = decodeURIComponent(decoded).trim()
    } catch {
        // A malformed escape is not a timestamp. Fall through to the numeric check below.
    }
    if (!/^\d{1,15}$/.test(decoded)) return null
    const seconds = Number(decoded)
    return Number.isFinite(seconds) && seconds > 0 ? seconds : null
}

/** Whether a row is the one the `[dateTs]` segment names. Seconds in, milliseconds compared. */
export function matchesEarningsDateParam(dateMs: number, seconds: number | null): boolean {
    return seconds !== null && Math.floor(dateMs / 1000) === seconds
}
