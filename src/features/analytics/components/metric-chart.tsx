'use client'

import { useTranslation } from '@shared/i18n/use-translation'
import { CHART_DRAW, CHART_FADE_IN } from '@shared/lib/motion'
import { cn } from '@shared/lib/utils'
import { type KeyboardEvent, memo, type PointerEvent, useMemo, useState } from 'react'
import type { ChannelStatMetric } from '../api/types'
import { buildChart, type ChartPoint, nearestIndex, pointChangePercent } from '../lib/chart'
import {
    formatAxisValue,
    formatBucketLabel,
    formatMetricValue,
    formatPercentChange,
} from '../lib/format'
import { metricLabel } from '../lib/metric-labels'

/**
 * The trend plot — one line for the selected metric, one dashed line for the period before it.
 *
 * ## Hand-drawn SVG, and why that is the cheaper option here
 *
 * The geometry lives in `lib/chart.ts`, which explains the decision at length: there is no chart in
 * the design system and no charting library in this app, and Recharts (legacy's) is ~90 KB gzipped
 * to draw two polylines with its own colours, its own tooltip and its own font. This component is
 * the paint: tokens for every stroke, DS type utilities for every label.
 *
 * ## Two engine notes, both about `preserveAspectRatio="none"`
 *
 * The plot has no intrinsic width, so the `<svg>` is stretched to whatever the column gives it.
 * That non-uniform scale has two consequences and both are handled rather than lived with:
 *
 * 1. **Strokes** would stretch with it — a 2px line thinning to 1.4px on a wide window. Every
 *    stroked element carries `vector-effect="non-scaling-stroke"`, so widths and the dash pattern
 *    stay in screen pixels.
 * 2. **A `<circle>` would become an ellipse.** So the active-point marker is not in the SVG at all:
 *    it is an absolutely positioned HTML element, placed at the same coordinates in percent. The
 *    axis labels are HTML for the same reason — scaled `<text>` is unreadable.
 *
 * ## The plot is `dir="ltr"` even in Arabic
 *
 * Time runs left to right in it. A mirrored time axis is not what an RTL reader expects from a chart
 * — the figures inside it are LTR either way, and the DS has no mirrored plot to port — so the
 * geometry stays put and only the surrounding prose flips. The value axis therefore stays on the
 * right in both directions, which is where legacy draws it.
 *
 * ## Accessibility: a table, not a label
 *
 * A chart cannot be described in an `aria-label`. There is a visually hidden `<table>` carrying every
 * bucket and its two figures, which is the shape a screen reader can actually navigate
 * (`docs/DEFINITION_OF_DONE.md` §10). Sighted keyboard users get the tooltip instead: the plot is
 * focusable and the arrow keys walk the buckets, which is also the only way to read a value without
 * a pointer.
 */

/** The plot's height in CSS pixels, which is also its viewBox height — see `lib/chart.ts`. */
const PLOT_HEIGHT = 200
const VIEW_WIDTH = 1000

/** Room on the inline-end edge for the value axis, and under the plot for the time axis. */
const AXIS_WIDTH = 52

/**
 * The line box of a 12px caption at the DS's default line height — 18px, rounded up to the 20px row
 * the time axis reserves.
 *
 * It is a number here because two things need it and both are about **not overflowing**: the value
 * axis clamps its end labels by half of it, and the time-axis row is this tall so an 18px line does
 * not hang 2px below a 16px box. See the note on the clamp.
 */
const LABEL_LINE_HEIGHT = 20

export function MetricChart({
    metric,
    compare,
    className,
}: {
    metric: ChannelStatMetric
    compare: boolean
    className?: string
}) {
    const { t, currentLanguage } = useTranslation()
    const [activeIndex, setActiveIndex] = useState<number | null>(null)

    const points: ChartPoint[] = useMemo(
        () =>
            metric.points.map((point, index) => ({
                date: point.date,
                current: point.amount,
                /*
                 * Buckets are paired **by position**, not by date: the previous period's buckets are
                 * different days, and pairing them by slot is what makes "the same day last month"
                 * comparable. It is also what the backend's own percentage does.
                 *
                 * `?? null`, never `?? 0`. A metric whose `prev_points` is empty (a real payload —
                 * see the `sticker_revenue` fixture) used to draw a dashed previous-period line flat
                 * along the baseline and read "↑ 100%" in every tooltip: a comparison asserted for a
                 * period the backend said nothing about.
                 */
                previous: metric.prevPoints[index]?.amount ?? null,
            })),
        [metric.points, metric.prevPoints],
    )

    const chart = useMemo(
        () =>
            buildChart({
                points,
                compare,
                width: VIEW_WIDTH,
                height: PLOT_HEIGHT,
                /*
                 * The finest division the axis can *label*: a whole session, or a cent. Without it a
                 * $0.02 month is divided into half-cents and the axis prints `$0.01` twice — which is
                 * also what React reported as two children with the key `grid-0.01`.
                 */
                minStep: metric.isInteger ? 1 : metric.currencyDisplay ? 0.01 : 0,
            }),
        [points, compare, metric.isInteger, metric.currencyDisplay],
    )

    const label = metricLabel(metric, t)
    /**
     * The metric's unit, memoised so it can be a real dependency below rather than a lint exception:
     * rebuilt every render it would make `tableRows`' memo never hit, which is the opposite of the
     * point.
     */
    const units = useMemo(
        () => ({ currencyDisplay: metric.currencyDisplay, isInteger: metric.isInteger }),
        [metric.currencyDisplay, metric.isInteger],
    )
    /** A figure being read — in the tooltip and in the accessible table, so it keeps its cents. */
    const format = (value: number) => formatMetricValue(value, units, currentLanguage)
    /** A gridline being labelled — whole numbers, so one axis is not two formats. */
    const axisLabel = (value: number) => formatAxisValue(value, units, currentLanguage)
    const bucketLabel = (index: number) =>
        formatBucketLabel(points[index]?.date, metric.hourInterval, currentLanguage)

    /*
     * Up to five time labels, evenly spaced, always including both ends. A label per bucket is
     * unreadable at 30 points and unusable at 90; legacy leaves it to Recharts'
     * `interval='preserveStartEnd'`, which drops labels until they fit and so shows a different
     * number of them per window width.
     */
    const timeTicks = useMemo(() => {
        const count = points.length
        if (count === 0) return []
        if (count <= 5) return points.map((_, index) => index)
        const wanted = 5
        return Array.from({ length: wanted }, (_, slot) =>
            Math.round((slot * (count - 1)) / (wanted - 1)),
        )
    }, [points])

    function pick(event: PointerEvent<HTMLDivElement>) {
        const box = event.currentTarget.getBoundingClientRect()
        if (box.width === 0) return
        setActiveIndex(nearestIndex((event.clientX - box.left) / box.width, points.length))
    }

    function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
        if (points.length === 0) return
        const current = activeIndex ?? 0
        switch (event.key) {
            case 'ArrowRight':
                setActiveIndex(Math.min(points.length - 1, current + 1))
                break
            case 'ArrowLeft':
                setActiveIndex(Math.max(0, current - 1))
                break
            case 'Home':
                setActiveIndex(0)
                break
            case 'End':
                setActiveIndex(points.length - 1)
                break
            case 'Escape':
                setActiveIndex(null)
                break
            default:
                return
        }
        // Only after a key we handled, so Tab and the page's own shortcuts still work.
        event.preventDefault()
    }

    /*
     * The table's rows, memoised on the data.
     *
     * The table is 30 buckets × 3 cells and it used to be built inline, so every pointer move across
     * the plot re-created 90 elements for React to diff — to show a tooltip that does not touch them.
     * With this and `ChartDataTable`'s `memo`, a hover re-renders the tooltip and the two markers and
     * nothing else.
     */
    const tableRows = useMemo(
        () =>
            points.map(point => ({
                key: point.date,
                bucket: formatBucketLabel(point.date, metric.hourInterval, currentLanguage),
                current: formatMetricValue(point.current, units, currentLanguage),
                previous: formatMetricValue(point.previous, units, currentLanguage),
            })),
        [points, metric.hourInterval, units, currentLanguage],
    )

    const active = activeIndex !== null ? points[activeIndex] : undefined
    const activeCoord = activeIndex !== null ? chart.coords[activeIndex] : undefined

    return (
        <figure className={cn('m-0 flex flex-col gap-3', className)}>
            <figcaption className="type-caption-meta text-(--text-subtitle)">
                {t('analytics_chart_trend_of', { metric: label })}
            </figcaption>

            <div className="flex flex-col gap-2">
                <div
                    /*
                     * `dir="ltr"` — see the header. `pe-[52px]` reserves the value axis; the SVG sits
                     * inside that inset so a point at the last bucket cannot slide under the labels.
                     */
                    dir="ltr"
                    className="relative w-full"
                    style={{ height: PLOT_HEIGHT, paddingInlineEnd: AXIS_WIDTH }}
                >
                    <div
                        data-testid="analytics-chart"
                        className={cn(
                            'relative h-full w-full outline-none',
                            'focus-visible:rounded-[4px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--focus-ring)',
                        )}
                        /*
                         * `role="img"` with a label, **and** in the tab order.
                         *
                         * The two are not in tension: to a screen reader this box is one graphic
                         * (its `<svg>` is `aria-hidden` and the real data is the table at the end of
                         * the figure), while to a sighted keyboard user the arrow keys below are the
                         * only way to read a value without a pointer — which is why it is focusable
                         * at all. The tooltip they move is a live region **outside** this element, so
                         * `role="img"` does not bury its announcements.
                         *
                         * ARIA has no role for "explorable plot". `img` is the honest description of
                         * what the pixels are; `group` would be closer to the behaviour but Biome
                         * maps it to `<fieldset>`, which is a form container and would be a worse
                         * lie than this one.
                         *
                         * biome-ignore lint/a11y/noNoninteractiveTabindex: removing the tabindex
                         * would make every value on this chart pointer-only.
                         */
                        tabIndex={0}
                        role="img"
                        aria-label={t('analytics_chart_trend_of', { metric: label })}
                        onPointerMove={pick}
                        onPointerDown={pick}
                        onPointerLeave={() => setActiveIndex(null)}
                        onBlur={() => setActiveIndex(null)}
                        onKeyDown={onKeyDown}
                    >
                        <svg
                            aria-hidden="true"
                            className="h-full w-full overflow-visible"
                            viewBox={`0 0 ${VIEW_WIDTH} ${PLOT_HEIGHT}`}
                            preserveAspectRatio="none"
                        >
                            {chart.ticks.map((tick, index) => (
                                <line
                                    /*
                                     * Keyed by **position**, not by value. Ticks are a positional
                                     * scale — nothing is inserted, removed or reordered within a
                                     * render, and the whole array is rebuilt when the domain changes —
                                     * so the index *is* the identity. Keying by value is what broke:
                                     * two ticks can round to the same printed number on a very small
                                     * domain, and React reported *"two children with the same key,
                                     * `grid-0.01`"* and dropped one of the lines. `minStep` stops the
                                     * duplicate values; this stops a duplicate breaking the render.
                                     *
                                     * biome-ignore lint/suspicious/noArrayIndexKey: a positional
                                     * scale, per the note above — the value is the thing that is not
                                     * unique.
                                     */
                                    key={`grid-${index}`}
                                    x1={0}
                                    x2={VIEW_WIDTH}
                                    y1={tick.y}
                                    y2={tick.y}
                                    stroke="var(--separator-default)"
                                    strokeWidth={1}
                                    vectorEffect="non-scaling-stroke"
                                />
                            ))}

                            {chart.previousPath ? (
                                <path
                                    d={chart.previousPath}
                                    fill="none"
                                    stroke="var(--accents-indigo-disabled)"
                                    strokeWidth={2}
                                    strokeDasharray="5 5"
                                    strokeLinecap="round"
                                    vectorEffect="non-scaling-stroke"
                                    // Fades in after the current line has drawn — see `CHART_FADE_IN`.
                                    className={CHART_FADE_IN}
                                />
                            ) : null}

                            {chart.currentPath ? (
                                <path
                                    d={chart.currentPath}
                                    fill="none"
                                    stroke="var(--accents-indigo-active)"
                                    strokeWidth={2}
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    vectorEffect="non-scaling-stroke"
                                    /*
                                     * Draws itself in. `pathLength={1}` normalises the line's length
                                     * so one dash covers it whatever the column's width — which is
                                     * what makes this survive `preserveAspectRatio="none"`. See
                                     * `tevi-chart-draw` in `globals.css`.
                                     */
                                    pathLength={1}
                                    strokeDasharray={1}
                                    className={CHART_DRAW}
                                />
                            ) : null}
                        </svg>

                        {/* One bucket draws no line (see `buildChart`), so the point itself is the
                            chart. Rendered as HTML for the same reason the marker is: a circle in a
                            non-uniformly scaled SVG is an ellipse. */}
                        {chart.coords.length === 1 ? (
                            <>
                                <Marker coord={chart.coords[0]} series="previous" />
                                <Marker coord={chart.coords[0]} />
                            </>
                        ) : null}

                        {activeCoord ? (
                            <>
                                <div
                                    aria-hidden="true"
                                    className="pointer-events-none absolute top-0 bottom-0 w-px bg-(--separator-strong)"
                                    style={{ left: `${(activeCoord.x / VIEW_WIDTH) * 100}%` }}
                                />
                                {activeCoord.previousY !== null ? (
                                    <Marker coord={activeCoord} series="previous" />
                                ) : null}
                                <Marker coord={activeCoord} />
                            </>
                        ) : null}

                        {points.length === 0 ? (
                            <p className="type-caption-meta absolute inset-0 flex items-center justify-center text-(--text-subtitle)">
                                {t('analytics_chart_no_points')}
                            </p>
                        ) : null}
                    </div>

                    {/* The value axis, pinned with the logical `end-0` even inside the forced-LTR
                        box: it resolves to the same edge here, and a logical property cannot be the
                        thing that breaks if this box ever stops forcing a direction. */}
                    <div
                        aria-hidden="true"
                        className="pointer-events-none absolute inset-y-0 end-0"
                        style={{ width: AXIS_WIDTH }}
                    >
                        {chart.ticks.map((tick, index) => (
                            <span
                                /*
                                 * Positional, for the reason the gridlines above are.
                                 *
                                 * biome-ignore lint/suspicious/noArrayIndexKey: same positional
                                 * scale; see the gridlines.
                                 */
                                key={`axis-${index}`}
                                className="type-caption-meta absolute ps-2 text-(--text-subtitle) tabular-nums"
                                style={{
                                    /*
                                     * Centred on the gridline, but **kept inside the plot**: the
                                     * bottom tick is at `PLOT_HEIGHT - 4` and a centred 18px line box
                                     * hangs 5px below it. `overflow: visible` boxes hand their
                                     * overflow to the nearest scroll container, which here is the
                                     * page — so those 5px became 5px of document nobody can see.
                                     * The same mechanism, at 768px, is what the `<table>` below did.
                                     * A 5px nudge on the two end labels is invisible against a
                                     * hairline; a page that scrolls into nothing is not.
                                     */
                                    top: Math.min(
                                        Math.max(tick.y, LABEL_LINE_HEIGHT / 2),
                                        PLOT_HEIGHT - LABEL_LINE_HEIGHT / 2,
                                    ),
                                    transform: 'translateY(-50%)',
                                }}
                            >
                                {axisLabel(tick.value)}
                            </span>
                        ))}
                    </div>

                    {active && activeCoord ? (
                        <Tooltip
                            /* Clamped to the middle 76% so the card cannot hang off either edge of a
                               phone-width column. A tooltip that is cut off is worse than one that is
                               a few pixels from its point. */
                            leftPercent={Math.min(
                                88,
                                Math.max(12, (activeCoord.x / VIEW_WIDTH) * 100),
                            )}
                            label={bucketLabel(activeIndex as number)}
                            metricName={label}
                            currentText={format(active.current)}
                            /*
                             * Both `null` when this bucket has no twin, not just when comparison is
                             * off: the tooltip then shows the current figure alone, which is the whole
                             * truth available for that slot.
                             */
                            previousText={
                                compare && active.previous !== null ? format(active.previous) : null
                            }
                            changePercent={
                                compare ? pointChangePercent(active.current, active.previous) : null
                            }
                            currentLabel={t('analytics_current_period')}
                            previousLabel={t('analytics_previous_period')}
                        />
                    ) : null}
                </div>

                {/* The time axis, positioned to match the buckets rather than distributed evenly:
                    with five labels over 30 buckets, `justify-between` would put each one up to half
                    a bucket away from the point it names. */}
                {/* `h-5`, not `h-4`: a 12px caption's line box is 18px, so a 16px row leaked 2px of
                    document scroll — the small end of the bug the `<table>` below caused at 768px. */}
                <div
                    dir="ltr"
                    className="relative"
                    style={{ height: LABEL_LINE_HEIGHT, marginInlineEnd: AXIS_WIDTH }}
                >
                    {timeTicks.map((index, slot) => {
                        const percent = (chart.coords[index]?.x ?? 0) / VIEW_WIDTH
                        return (
                            <span
                                key={`time-${points[index]?.date ?? index}`}
                                aria-hidden="true"
                                className={cn(
                                    'type-caption-meta absolute whitespace-nowrap text-(--text-subtitle)',
                                    /*
                                     * Every other middle label goes below `sm`. Five labels need
                                     * ~340px to sit apart; a phone column gives the plot ~280, and
                                     * measured in the browser they collided into `Jan 21Jan 28`.
                                     *
                                     * CSS rather than a measured width, deliberately: the count is a
                                     * function of how much room there is, and a `ResizeObserver` to
                                     * answer that would re-render the chart on every window drag to
                                     * decide something a media query already knows. The ends always
                                     * stay — a time axis with no first and last bucket names nothing.
                                     */
                                    slot % 2 === 1 && 'max-sm:hidden',
                                )}
                                style={{
                                    left: `${percent * 100}%`,
                                    // The end labels are pinned to their edge instead of centred, so
                                    // neither is half outside the plot.
                                    transform:
                                        percent === 0
                                            ? 'none'
                                            : percent === 1
                                              ? 'translateX(-100%)'
                                              : 'translateX(-50%)',
                                }}
                            >
                                {bucketLabel(index)}
                            </span>
                        )
                    })}
                </div>
            </div>

            {compare ? (
                <ul className="flex list-none items-center justify-center gap-4 p-0">
                    <LegendItem
                        color="var(--accents-indigo-active)"
                        label={t('analytics_current_period')}
                    />
                    <LegendItem
                        color="var(--accents-indigo-disabled)"
                        dashed
                        label={t('analytics_previous_period')}
                    />
                </ul>
            ) : null}

            <ChartDataTable
                caption={t('analytics_chart_trend_of', { metric: label })}
                bucketHeader={t('analytics_chart_bucket')}
                currentHeader={t('analytics_current_period')}
                previousHeader={t('analytics_previous_period')}
                rows={tableRows}
                compare={compare}
            />
        </figure>
    )
}

/** The dot on a line. HTML, so it stays round — see the header. */
function Marker({
    coord,
    series = 'current',
}: {
    coord: { x: number; y: number; previousY: number | null }
    series?: 'current' | 'previous'
}) {
    const y = series === 'current' ? coord.y : coord.previousY
    if (y === null) return null
    return (
        <span
            aria-hidden="true"
            className={cn(
                'pointer-events-none absolute size-2.5 rounded-full',
                series === 'current'
                    ? 'bg-(--accents-indigo-active) ring-2 ring-(--background-surface)'
                    : 'bg-(--accents-indigo-disabled)',
            )}
            style={{
                left: `${(coord.x / VIEW_WIDTH) * 100}%`,
                top: y,
                transform: 'translate(-50%, -50%)',
            }}
        />
    )
}

function LegendItem({
    color,
    label,
    dashed = false,
}: {
    color: string
    label: string
    dashed?: boolean
}) {
    return (
        <li className="flex items-center gap-1.5">
            <span
                aria-hidden="true"
                className="h-0.5 w-4 rounded-full"
                style={
                    dashed
                        ? {
                              backgroundImage: `repeating-linear-gradient(90deg, ${color} 0 3px, transparent 3px 6px)`,
                          }
                        : { backgroundColor: color }
                }
            />
            <span className="type-caption-meta text-(--text-subtitle)">{label}</span>
        </li>
    )
}

/**
 * The hover card.
 *
 * `pointer-events-none` is load-bearing: the card sits over the plot, and a card that could be
 * pointed at would steal the pointer from the region tracking it and make the tooltip flicker as it
 * chased the cursor out from under itself.
 */
function Tooltip({
    leftPercent,
    label,
    metricName,
    currentText,
    previousText,
    changePercent,
    currentLabel,
    previousLabel,
}: {
    leftPercent: number
    label: string
    metricName: string
    currentText: string
    previousText: string | null
    changePercent: number | null
    currentLabel: string
    previousLabel: string
}) {
    const isUp = (changePercent ?? 0) >= 0
    return (
        <div
            role="status"
            aria-live="polite"
            className={cn(
                'pointer-events-none absolute top-2 z-10 flex min-w-[160px] flex-col gap-1',
                'rounded-[var(--radius-lg)] border border-(--separator-default) bg-(--background-elevated) p-3 shadow-lg',
            )}
            style={{ left: `${leftPercent}%`, transform: 'translateX(-50%)' }}
        >
            <p className="type-dense-strong text-(--text-title)">{metricName}</p>
            <p className="type-caption-meta text-(--text-subtitle)">{label}</p>
            <p className="type-dense-emphasis text-(--text-title) tabular-nums">
                <span className="type-caption-meta me-1 text-(--text-subtitle)">
                    {currentLabel}
                </span>
                {currentText}
            </p>
            {previousText !== null ? (
                <p className="type-dense-default text-(--text-subtitle) tabular-nums">
                    <span className="type-caption-meta me-1">{previousLabel}</span>
                    {previousText}
                </p>
            ) : null}
            {changePercent !== null ? (
                <p
                    className={cn(
                        'type-caption-label-strong tabular-nums',
                        isUp ? 'text-(--text-success)' : 'text-(--text-error)',
                    )}
                >
                    {isUp ? '↑' : '↓'} {formatPercentChange(changePercent)}
                </p>
            ) : null}
        </div>
    )
}

/**
 * The plot's accessible twin — every bucket and its two figures, for a screen reader.
 *
 * `memo`, and its rows arrive pre-formatted, because the **pointer** must not re-render it: the hover
 * state lives in `MetricChart`, and rebuilding 30 rows on every pointer step was 90 elements diffed
 * for a table nobody is looking at.
 *
 * ⚠ The `sr-only` is on the wrapping `<div>`, never on the `<table>`. A table sizes itself to its
 * content whatever width and height you ask for, so `sr-only` on it leaves a full-size invisible box
 * that **extends the document** — 768px of phantom scroll, which is what broke the shell's sticky rail
 * on this screen. `src/shared/lib/sr-only.test.ts` fails if anyone puts it back.
 */
const ChartDataTable = memo(function ChartDataTable({
    caption,
    bucketHeader,
    currentHeader,
    previousHeader,
    rows,
    compare,
}: {
    caption: string
    bucketHeader: string
    currentHeader: string
    previousHeader: string
    rows: { key: number; bucket: string; current: string; previous: string }[]
    compare: boolean
}) {
    if (rows.length === 0) return null
    return (
        <div className="sr-only">
            <table>
                <caption>{caption}</caption>
                <thead>
                    <tr>
                        <th scope="col">{bucketHeader}</th>
                        <th scope="col">{currentHeader}</th>
                        {compare ? <th scope="col">{previousHeader}</th> : null}
                    </tr>
                </thead>
                <tbody>
                    {rows.map(row => (
                        <tr key={row.key}>
                            <th scope="row">{row.bucket}</th>
                            <td>{row.current}</td>
                            {compare ? <td>{row.previous}</td> : null}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    )
})
