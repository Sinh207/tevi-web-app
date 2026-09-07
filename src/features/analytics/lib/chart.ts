/**
 * The geometry behind the trend chart — a pure function from data points to SVG coordinates.
 *
 * ## Why this app draws its own chart
 *
 * There is no chart in the design system (`docs/DESIGN_SYSTEM.md` lists the five families that were
 * not ported; a plot is not among the ones that were either) and no charting library in the
 * dependency list. Legacy uses Recharts, which is ~90 KB gzipped on a screen that draws **one**
 * line and one dashed comparison — and it brings its own colours, its own tooltip and its own idea
 * of a font, none of which are the DS's. So the chart is an `<svg>`: two `<path>`s, a few grid
 * lines, and semantic tokens for every stroke.
 *
 * Keeping the arithmetic here, apart from the component, is what makes it checkable. A chart that
 * is wrong is not obviously wrong — it is a plausible line — so the scale, the baseline and the
 * tick steps are unit-tested rather than eyeballed.
 *
 * ## Two decisions that are about honesty, not looks
 *
 * 1. **The baseline is 0 whenever the data is non-negative.** Scaling to `dataMin` makes a rise
 *    from 1,000 to 1,010 look like a doubling. Revenue and counts are the two things on this
 *    screen and both are read as magnitudes, so the axis starts where the magnitude does. A metric
 *    that can go negative (unfollowers is sent positive, but a refunded revenue bucket can be)
 *    keeps its real minimum, because clamping *that* to 0 would hide the sign.
 * 2. **Straight segments, no smoothing.** A monotone spline through daily buckets draws values
 *    between them that nobody measured, and its overshoot invents peaks the data does not contain.
 *    The points are discrete buckets; the line joins them.
 */

/** One bucket, with its comparison twin where the periods line up. */
export interface ChartPoint {
    /** Bucket start, epoch milliseconds. */
    date: number
    current: number
    /**
     * The same slot in the previous period, or `null` when the backend sent no comparison bucket for this slot — **not `0`**. A missing figure
     * and a figure of zero are different sentences, and `ChartCoord.previousY` below promises to carry
     * that difference. The component used to coerce it (`?? 0`), which drew a dashed "Previous period"
     * line flat along the baseline for a metric with no previous data and made every tooltip read
     * "↑ 100%" — a comparison asserted for a period nobody sent.
     */
    previous: number | null
}

/** Where a bucket landed, in viewBox units — what the component needs for dots and hit-testing. */
export interface ChartCoord {
    x: number
    y: number
    /** `null` when comparison is off, or when this bucket has no twin. */
    previousY: number | null
}

export interface ChartAxisTick {
    value: number
    y: number
}

export interface ChartModel {
    /** `d` for the current-period line. `''` when there is nothing to draw. */
    currentPath: string
    /** `d` for the dashed previous-period line, or `''`. */
    previousPath: string
    coords: ChartCoord[]
    /** Horizontal rules, one per tick, in viewBox units. */
    ticks: ChartAxisTick[]
    /** The domain actually plotted, after the baseline and nice-step rules below. */
    min: number
    max: number
    width: number
    height: number
}

const DEFAULT_WIDTH = 1000
const DEFAULT_HEIGHT = 200

/**
 * Vertical breathing room, in viewBox units, so a 2px stroke at the domain's very top is not
 * clipped in half by the viewport edge. The chart is rendered with `preserveAspectRatio="none"` at
 * its natural height, so one vertical unit is one CSS pixel and this is literally 4px.
 */
const INSET_Y = 4

/** Round a **coordinate** to 2dp — short paths, and a value a test can state exactly. */
function round(value: number): number {
    return Math.round(value * 100) / 100
}

/**
 * Round a **tick value** to the precision its own step carries.
 *
 * The coordinate rounding above is 2dp because a viewBox unit finer than that is invisible. A tick
 * *value* is a number the axis prints, and 2dp is not always enough: a step of `0.005` collapses to
 * `0.01` twice over, which is how the axis came to read `$0 · $0.01 · $0.01 · $0.02 · $0.02`.
 *
 * `minStep` normally keeps steps at or above the unit, so this is the backstop for the case it does
 * not cover — a metric with no unit and a very small range. Floating point is why it rounds at all:
 * `0.1 * 3` is `0.30000000000000004`, and an axis label of `0.30000000000000004` is worse than one
 * rounded a digit too far.
 */
function roundToStep(value: number, step: number): number {
    if (!Number.isFinite(step) || step <= 0) return value
    // One digit finer than the step itself, capped: `1e-9` is past any unit this app deals in.
    const digits = Math.min(9, Math.max(0, Math.ceil(-Math.log10(step)) + 1))
    const factor = 10 ** digits
    return Math.round(value * factor) / factor
}

/**
 * A tick step a human would choose: 1, 2 or 5 times a power of ten.
 *
 * `Math.ceil(max / 4)` would give steps of 37 and label an axis `0 · 37 · 74 · 111`. This is the
 * 1-2-5 ladder every charting library lands on, with D3's rounding thresholds (`√2`, `√10`, `√50`)
 * rather than a plain ceiling — a ceiling turns a rough step of 2.5 into 5 and halves the number of
 * grid lines, so a chart asked for four ticks routinely draws two.
 *
 * The returned step is therefore *near* the rough value in either direction, which means the tick
 * count is approximate. That is the trade the ladder exists to make: round numbers on the axis are
 * worth more than an exact number of lines.
 */
export function niceStep(rough: number): number {
    if (!Number.isFinite(rough) || rough <= 0) return 1
    const magnitude = 10 ** Math.floor(Math.log10(rough))
    const normalised = rough / magnitude
    const step =
        normalised >= Math.sqrt(50)
            ? 10
            : normalised >= Math.sqrt(10)
              ? 5
              : normalised >= Math.sqrt(2)
                ? 2
                : 1
    return step * magnitude
}

/** Ticks are lines across the plot; past this many they stop reading as a scale and start as hatching. */
const MAX_TICKS = 8

/**
 * Build the plot.
 *
 * `compare` off drops the previous series entirely — from the path *and* from the domain, so
 * turning the comparison off re-scales the axis to the current period alone. Leaving it in the
 * domain would mean a chart whose line sits in the bottom fifth for no visible reason.
 *
 * An empty `points` array returns an empty model rather than throwing: the caller renders its empty
 * state, and a chart component that can be handed a zero-length series without crashing is one less
 * thing for the view to guard.
 */
export function buildChart({
    points,
    compare = true,
    width = DEFAULT_WIDTH,
    height = DEFAULT_HEIGHT,
    tickCount = 4,
    minStep = 0,
}: {
    points: readonly ChartPoint[]
    compare?: boolean
    width?: number
    height?: number
    tickCount?: number
    /**
     * The smallest division the **labels** can express, in the metric's own unit — `1` for a count,
     * `0.01` for money. `0` (the default) leaves the ladder alone.
     *
     * It exists because the axis is labelled at the unit's precision while the ladder is not aware of
     * any unit, so a small domain produces steps the labels cannot tell apart. Both halves of that
     * were seen in the browser:
     *
     * - **a count of 0–2** got a step of `0.5` and an axis reading `0 · 1 · 1 · 2 · 2`;
     * - **$0.02 of revenue** got a step of `0.005` and an axis reading `$0 · $0.01 · $0.01 · $0.02 ·
     *   $0.02` — and, because the ticks are keyed by value, React's *"two children with the same key,
     *   `grid-0.01`"* on top of it.
     *
     * Clamping the step to the unit fixes the numbers at the source: `0 · 1 · 2` and
     * `$0 · $0.01 · $0.02`. Keys are keyed by position as well (see `metric-chart.tsx`) — a duplicate
     * value should not be able to break a render even if one ever gets through.
     */
    minStep?: number
}): ChartModel {
    if (points.length === 0) {
        return {
            currentPath: '',
            previousPath: '',
            coords: [],
            ticks: [],
            min: 0,
            max: 0,
            width,
            height,
        }
    }

    const values = points.map(point => point.current)
    // Only the twins that exist enter the domain: a `null` bucket must not pull the scale to zero.
    if (compare) {
        values.push(
            ...points
                .map(point => point.previous)
                .filter((value): value is number => value !== null),
        )
    }

    const dataMax = Math.max(...values)
    const dataMin = Math.min(...values)

    /*
     * The domain. `min` is 0 for non-negative data (see the file header) and the real minimum
     * otherwise; `max` is rounded **up** to a whole number of tick steps so the top grid line is
     * the axis's own last label rather than a line floating below it.
     *
     * All-equal data — a period where nothing happened, which is the first thing a new creator
     * sees — has a zero-height domain and would divide by zero. It gets a domain of `[0, 1]` (or
     * `[v, v + 1]`), so the line is flat at the bottom, which is the truth.
     */
    const min = dataMin >= 0 ? 0 : dataMin
    let step = niceStep((dataMax - min) / tickCount || 1)
    // The unit is the floor: a count cannot be halved, and money cannot be split below a cent.
    if (minStep > 0 && step < minStep) step = minStep
    let steps = Math.max(1, Math.ceil((dataMax - min) / step))
    // A domain the ladder split too finely (a rough step rounded *down*) is halved back rather
    // than left as a dozen hairlines behind the line.
    while (steps > MAX_TICKS) {
        step *= 2
        steps = Math.max(1, Math.ceil((dataMax - min) / step))
    }
    const max = min + step * steps
    const span = max - min || 1

    const plotHeight = height - INSET_Y * 2
    const y = (value: number) => round(INSET_Y + plotHeight * (1 - (value - min) / span))
    /*
     * A single bucket is centred rather than pinned to x=0. A one-point period ("yesterday", on an
     * account whose backend returned one hourly bucket) has no line to draw, so the component shows
     * the dot — and a dot hard against the left edge reads as a clipped chart.
     */
    const x = (index: number) =>
        points.length === 1 ? round(width / 2) : round((width * index) / (points.length - 1))

    const coords: ChartCoord[] = points.map((point, index) => ({
        x: x(index),
        y: y(point.current),
        // `null` twice over, and they mean the same thing to every consumer: comparison is off, or
        // this slot has no twin. Both must draw no dot, no segment and no percentage.
        previousY: compare && point.previous !== null ? y(point.previous) : null,
    }))

    const toPath = (pick: (coord: ChartCoord) => number | null) => {
        const segments: string[] = []
        coords.forEach((coord, index) => {
            const value = pick(coord)
            if (value === null) return
            segments.push(`${index === 0 ? 'M' : 'L'}${coord.x},${value}`)
        })
        // One point is a `M` with no line — invisible. The component draws the dot instead.
        return segments.length > 1 ? segments.join(' ') : ''
    }

    const ticks: ChartAxisTick[] = []
    for (let index = 0; index <= steps; index += 1) {
        const value = min + step * index
        ticks.push({ value: roundToStep(value, step), y: y(value) })
    }

    return {
        currentPath: toPath(coord => coord.y),
        previousPath: compare ? toPath(coord => coord.previousY) : '',
        coords,
        ticks,
        min,
        max,
        width,
        height,
    }
}

/**
 * Which bucket a pointer at `ratio` (0…1 across the plot) is nearest.
 *
 * Nearest rather than "the one to the left", because the buckets are *samples*: the reader is
 * pointing at a dot, not into an interval, and flooring would make the last bucket unreachable
 * except at the exact right edge. Legacy gets this from Recharts and it behaves the same way.
 */
export function nearestIndex(ratio: number, count: number): number {
    if (count <= 0) return -1
    if (!Number.isFinite(ratio)) return 0
    const clamped = Math.min(1, Math.max(0, ratio))
    return Math.round(clamped * (count - 1))
}

/**
 * The percent change between two buckets, for the tooltip.
 *
 * `0 → n` is **+100%** rather than infinity, matching legacy and the backend's own
 * `last_duration_compare_percent` on a period that started from nothing. `0 → 0` is 0%.
 */
export function pointChangePercent(current: number, previous: number | null): number | null {
    /*
     * `null` in, `null` out: no twin means there is nothing to compare against, and the caller must
     * print nothing rather than "↑ 100%" — which is what a coerced `0` produced for every bucket of a
     * metric the backend sent no previous data for.
     */
    if (previous === null) return null
    if (!previous) return current > 0 ? 100 : 0
    return ((current - previous) / previous) * 100
}
