import { z } from 'zod'

/**
 * What the report service says about a creator's daily earnings.
 *
 * Two endpoints, one shape each, and both are read **only** by this feature:
 *
 * - `report/v1/channel/revenue/daily/` — one row per day, newest first.
 * - `report/v1/channel/revenue/daily/detail/` — that day's total split by revenue category.
 *
 * ## Why every field is normalised rather than trusted
 *
 * Same posture as `features/channel/api/types.ts`: parse at the boundary, `.catch()` per field,
 * never a top-level throw. The difference is what a bad parse costs here — this screen shows a
 * creator **money**, so the failure mode to avoid is not a blank page but a *plausible wrong
 * number*. Hence the two rules below, which are the whole reason this file is not an `interface`:
 *
 * 1. **An amount that cannot be read is `0`, and a row whose date cannot be read is dropped.**
 *    A row with no date cannot be labelled, cannot be expanded (the detail call is keyed on it)
 *    and cannot be linked to — it has nothing to be except a row saying `$0` on no particular
 *    day, which is worse than not being there.
 * 2. **Amounts may arrive as strings.** Money over JSON commonly does, precisely to avoid float
 *    drift, and `"12.50" * 1` is `12.5` while `Number(undefined)` is `NaN` — which renders as
 *    `$NaN` if nothing catches it. Legacy never checked; it multiplied by an exchange rate and
 *    handed the result to `Intl`.
 *
 * Unknown fields are **kept** (`looseObject`), for the reason the channel DTO keeps them: the
 * backend ships more than this file models and a field that appears tomorrow should reach a call
 * site that asks for it rather than being deleted here.
 *
 * See `docs/BACKEND_QUESTIONS.md` B29–B31 for what is still guessed at: the currency, the unit of
 * `date`, and the closed set of `category` values.
 */

/**
 * A money amount. Accepts a number or a numeric string; anything else is `0`.
 *
 * Not `null` on failure, deliberately. Every consumer sums or formats this, so a nullable amount
 * pushes `?? 0` to each of them and the one that forgets prints `$NaN` into a financial report.
 * `0` is the honest reading of "the backend sent nothing here" — it is also what the row would
 * show if the category genuinely earned nothing.
 */
const amount = z
    .unknown()
    .transform(value => {
        if (typeof value === 'number') return Number.isFinite(value) ? value : 0
        if (typeof value === 'string') {
            const trimmed = value.trim()
            if (trimmed === '') return 0
            const parsed = Number(trimmed)
            return Number.isFinite(parsed) ? parsed : 0
        }
        return 0
    })
    .catch(0)

/**
 * The day a row totals, as epoch **milliseconds** — or `null`, which drops the row.
 *
 * ## Milliseconds, and why that is asserted rather than assumed
 *
 * Legacy is internally inconsistent about the unit and the inconsistency is load-bearing, so it
 * is worth writing down: it sends `to_date_ts: Date.now()` (ms) and `date_ts: item.date`
 * (whatever the row carried) to the API, but the **URL** segment for a linked day is seconds —
 * `Math.floor(item.date / 1000) === Number(dateTs)` is the comparison it makes. Both can only be
 * true if `date` is milliseconds. That is the reading this file encodes; B30 asks the API team to
 * confirm it.
 *
 * A value that looks like *seconds* (below the year-2001 millisecond mark) is promoted rather
 * than rendered as 1970. That guard is not hypothetical tidiness — it is the exact failure a unit
 * change on the wire would produce, and it would show up as every row in the report claiming to
 * be from January 1970 while the amounts stayed right.
 */
const SECONDS_CUTOFF_MS = 1_000_000_000_000

const epochMs = z
    .unknown()
    .transform(value => {
        const raw =
            typeof value === 'number'
                ? value
                : typeof value === 'string' && value.trim() !== ''
                  ? Number(value)
                  : Number.NaN
        if (!Number.isFinite(raw) || raw <= 0) return null
        return raw < SECONDS_CUTOFF_MS ? Math.round(raw * 1000) : Math.round(raw)
    })
    .catch(null)

const dailyRevenueSchema = z.looseObject({
    id: z.union([z.string(), z.number()]).transform(String).catch(''),
    date: epochMs,
    total: amount,
})

/** One day in the report — a date, what it earned, and a key to list it under. */
export interface EarningsDay {
    /**
     * List key **and** the identity the expanded panel is keyed on.
     *
     * The row's own id where the backend sends one, else the timestamp — which is unique by
     * construction, since these are daily buckets. Legacy falls back to the array index, and that
     * is the version that breaks: the list is newest-first, so a new day arriving at the top
     * shifts every index by one and React reuses the wrong row's expanded state.
     */
    id: string
    /** Epoch **milliseconds**, the start of the day this row totals. */
    date: number
    /** The day's net earnings — after fees, which is what the section subtitle promises. */
    total: number
}

/**
 * Parse the daily list.
 *
 * Accepts the array either bare or under `results`. The client unwraps the backend's `{ data: … }`
 * envelope before this sees it (`shared/lib/api/unwrap.ts`), so the bare array is the expected
 * shape and `results` is the paginated one this endpoint may grow into — cheap to accept now,
 * versus a screen that silently empties on the day pagination is switched on.
 *
 * Rows are **sorted newest-first here** rather than trusted to arrive that way. The screen reads
 * as a reverse-chronological ledger and legacy renders the array as-is; one endpoint changing its
 * `ORDER BY` should not reorder a financial report.
 */
export function normalizeEarningsDays(body: unknown): EarningsDay[] {
    const rows = Array.isArray(body)
        ? body
        : Array.isArray((body as { results?: unknown })?.results)
          ? ((body as { results: unknown[] }).results as unknown[])
          : []

    const days: EarningsDay[] = []
    for (const row of rows) {
        const parsed = dailyRevenueSchema.safeParse(row)
        if (!parsed.success) continue
        const { id, date, total } = parsed.data
        // No date, no row — see the note on `EarningsDay.date`.
        if (date === null) continue
        days.push({ id: id || String(date), date, total })
    }
    return days.sort((a, b) => b.date - a.date)
}

/** One revenue category's share of a day. */
export interface EarningsCategoryAmount {
    /** The backend's own slug — `direct_donation`, `membership`, … See B31. */
    category: string
    revenue: number
}

const detailSchema = z.looseObject({
    category: z
        .unknown()
        .transform(v => (typeof v === 'string' ? v.trim() : ''))
        .catch(''),
    revenue: amount,
})

/**
 * Parse one day's category split.
 *
 * Accepts `{ details: [...] }` (legacy's shape) or a bare array. Rows with no `category` are
 * dropped: the category is what the label is looked up by, so a nameless row could only be
 * rendered as a blank line with money beside it.
 *
 * **Zero-revenue rows are kept here and filtered at the call site.** They are two different
 * decisions — "the backend told us about this category" and "this category is worth a line on
 * screen" — and only the second one is a design choice. Keeping them lets
 * `earningsCategoryRows()` explain itself, and lets a future variant show every category.
 */
export function normalizeEarningsDetails(body: unknown): EarningsCategoryAmount[] {
    const rows = Array.isArray(body)
        ? body
        : Array.isArray((body as { details?: unknown })?.details)
          ? ((body as { details: unknown[] }).details as unknown[])
          : []

    const out: EarningsCategoryAmount[] = []
    for (const row of rows) {
        const parsed = detailSchema.safeParse(row)
        if (!parsed.success || !parsed.data.category) continue
        out.push({ category: parsed.data.category, revenue: parsed.data.revenue })
    }
    return out
}
