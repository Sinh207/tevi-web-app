import { z } from 'zod'

/**
 * What the report service says about a channel's performance.
 *
 * Four endpoints, read only by this feature:
 *
 * - `report/v1/channel/stats/` — one entry per selected metric, each with its own series.
 * - `report/v1/channel/top-earning-content/` — the period's best-earning posts and streams.
 * - `report/v1/config/metrics/` — every metric that *could* be shown.
 * - `report/v1/config/user_config/metrics/` — the four this account has chosen.
 *
 * ## Parse at the boundary, never throw
 *
 * Same posture as `features/earnings/api/types.ts`, and the failure to avoid is the same: this
 * screen shows a creator **money**, so a bad parse must not become a plausible wrong number. Two
 * rules follow, and they are why this file is not a set of `interface`s:
 *
 * 1. **A figure that cannot be read is `0`; a metric that cannot be identified is dropped.** A
 *    metric with no `id` cannot be a tab (it is the key, the selection and the swap target), and a
 *    point with no date cannot be placed on an axis.
 * 2. **Numbers may arrive as strings.** `last_duration_compare_percent` does — legacy calls
 *    `parseFloat` on it — and money over JSON commonly does too. `Number(undefined)` is `NaN`,
 *    which renders as `NaN%` if nothing catches it.
 *
 * Every schema is a `looseObject`, which is about **tolerance rather than pass-through**: the backend
 * ships more than this file models, and an unmodelled field must not make a row fail to parse. What
 * each parser returns is still an explicit mapping — the wire's `prev_display` becomes `prevDisplay`
 * and nothing unnamed rides along — so surfacing a new field is a line in the interface and a line in
 * the mapping, not a cast at the call site.
 *
 * ## The headline figures are strings, and that is the contract
 *
 * `display` / `prev_display` arrive **pre-formatted** ("$1,204.30") and are printed verbatim. The
 * server knows the account's currency and its decimal digits; the client does not (see
 * `lib/format.ts`). `points[].amount` is the raw number, for the chart alone.
 *
 * See `docs/BACKEND_QUESTIONS.md` B57–B60 for what is still guessed at here.
 */

/** A number, whether it arrived as one or as a numeric string. Anything else is `0`. */
const numeric = z
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
 * Epoch **milliseconds**, or `null`.
 *
 * A value that looks like seconds (below the year-2001 millisecond mark) is promoted rather than
 * plotted in 1970. Same guard, same reasoning, as `features/earnings/api/types.ts`: it is the exact
 * failure a unit change on the wire would produce, and it would show as a chart of dates from
 * January 1970 with the amounts still right.
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

const text = z
    .unknown()
    .transform(value => (typeof value === 'string' ? value.trim() : ''))
    .catch('')

const identifier = z.union([z.string(), z.number()]).transform(String).catch('')

/** One bucket of a metric's series. */
export interface MetricSeriesPoint {
    /** Bucket start, epoch milliseconds. */
    date: number
    amount: number
}

const pointSchema = z.looseObject({ date: epochMs, amount: numeric })

function normalizePoints(value: unknown): MetricSeriesPoint[] {
    if (!Array.isArray(value)) return []
    const points: MetricSeriesPoint[] = []
    for (const row of value) {
        const parsed = pointSchema.safeParse(row)
        if (!parsed.success || parsed.data.date === null) continue
        points.push({ date: parsed.data.date, amount: parsed.data.amount })
    }
    // Sorted here rather than trusted to arrive in order: a line chart drawn from unordered points
    // is a scribble, and one endpoint changing its `ORDER BY` should not produce that.
    return points.sort((a, b) => a.date - b.date)
}

/** One metric as the dashboard shows it: a headline, a comparison, and a series. */
export interface ChannelStatMetric {
    /** Row id. The tab key, and what the swap endpoint is addressed by. */
    id: string
    /** Stable wire slug — `total_revenue`. What `metricLabel` looks the translation up by. */
    name: string
    /** The backend's own English label. The fallback when we have no key for `name`. */
    description: string
    /** Pre-formatted current total, printed verbatim. `''` if the backend sent none. */
    display: string
    /** Pre-formatted previous-period total. */
    prevDisplay: string
    /** Change against the previous period, in percent. Signed: the sign picks the arrow. */
    changePercent: number
    /** Counts (followers, sessions) round; money does not. */
    isInteger: boolean
    /** The currency symbol to prepend to raw chart values, or `''` for a count. */
    currencyDisplay: string
    /** The bucket size the series was aggregated at — 1, 24 or 168 hours. */
    hourInterval: number
    points: MetricSeriesPoint[]
    /** The same buckets in the previous period. Empty when the backend sent none. */
    prevPoints: MetricSeriesPoint[]
}

const metricSchema = z.looseObject({
    id: identifier,
    name: text,
    description: text,
    display: text,
    prev_display: text,
    last_duration_compare_percent: numeric,
    is_integer: z.unknown().transform(Boolean).catch(false),
    currency_display: text,
    hour_interval: numeric,
    points: z.unknown(),
    prev_points: z.unknown(),
})

export function normalizeChannelStats(body: unknown): ChannelStatMetric[] {
    const rows = Array.isArray(body)
        ? body
        : Array.isArray((body as { results?: unknown })?.results)
          ? ((body as { results: unknown[] }).results as unknown[])
          : []

    const metrics: ChannelStatMetric[] = []
    for (const row of rows) {
        const parsed = metricSchema.safeParse(row)
        if (!parsed.success) continue
        const data = parsed.data
        // No id, no tab — see rule 1 in the file header.
        if (!data.id) continue
        metrics.push({
            id: data.id,
            name: data.name,
            description: data.description,
            display: data.display,
            prevDisplay: data.prev_display,
            changePercent: data.last_duration_compare_percent,
            isInteger: data.is_integer,
            currencyDisplay: data.currency_display,
            // A bucket size of 0 would make `formatBucketLabel` print a time for daily buckets.
            // 24 is the endpoint's own default and the only safe guess.
            hourInterval: data.hour_interval > 0 ? data.hour_interval : 24,
            points: normalizePoints(data.points),
            prevPoints: normalizePoints(data.prev_points),
        })
    }
    return metrics
}

/** One row of the top-earning list. */
export interface TopEarningItem {
    /** List key. The backend sends no id, so it is composed — see `normalizeTopEarning`. */
    key: string
    thumbnail: string
    title: string
    /** What kind of content it is — the backend's own word ("Post", "Live"). May be empty. */
    tag: string
    /** Pre-formatted earnings, printed verbatim. */
    display: string
    /** When it was published, epoch milliseconds, or `null` — the line is dropped then. */
    time: number | null
}

const topEarningSchema = z.looseObject({
    thumbnail: text,
    title: text,
    tag: text,
    display: text,
    time: epochMs,
})

/**
 * Parse the top-earning list.
 *
 * Accepts the array bare or under `items` / `results` — legacy's transformer accepts the first two
 * and the third is what this endpoint becomes if it is ever paginated.
 *
 * **A row with no title is dropped.** The row is a link to a piece of content the creator wrote; an
 * untitled one is a thumbnail and a figure with nothing to say which post earned it.
 *
 * The key is `index:time`, not `index`. The list is a ranking, so a refetch can reorder it — and a
 * bare index makes React reuse the wrong row's DOM (the thumbnail of one post above another's
 * title, for a frame). Legacy keys on the index and has exactly that flicker.
 */
export function normalizeTopEarning(body: unknown): TopEarningItem[] {
    const container = body as { items?: unknown; results?: unknown } | null
    const rows = Array.isArray(body)
        ? body
        : Array.isArray(container?.items)
          ? (container.items as unknown[])
          : Array.isArray(container?.results)
            ? (container.results as unknown[])
            : []

    const items: TopEarningItem[] = []
    rows.forEach((row, index) => {
        const parsed = topEarningSchema.safeParse(row)
        if (!parsed.success || !parsed.data.title) return
        items.push({
            key: `${index}:${parsed.data.time ?? 'na'}`,
            thumbnail: parsed.data.thumbnail,
            title: parsed.data.title,
            tag: parsed.data.tag,
            display: parsed.data.display,
            time: parsed.data.time,
        })
    })
    return items
}

/** A metric that can be put in a tab slot. */
export interface MetricOption {
    id: string
    name: string
    description: string
}

const optionSchema = z.looseObject({ id: identifier, name: text, description: text })

/**
 * Parse a metric list — used for both `config/metrics/` (everything available) and
 * `config/user_config/metrics/` (this account's four).
 *
 * One function for both because the two payloads are the same shape and the only difference is
 * which question they answer. Rows with no `id` are dropped: the id is what the swap request is
 * addressed by, so a row without one is a menu entry that cannot be chosen.
 */
export function normalizeMetricOptions(body: unknown): MetricOption[] {
    const rows = Array.isArray(body)
        ? body
        : Array.isArray((body as { results?: unknown })?.results)
          ? ((body as { results: unknown[] }).results as unknown[])
          : []

    const options: MetricOption[] = []
    for (const row of rows) {
        const parsed = optionSchema.safeParse(row)
        if (!parsed.success || !parsed.data.id) continue
        options.push({
            id: parsed.data.id,
            name: parsed.data.name,
            description: parsed.data.description,
        })
    }
    return options
}
