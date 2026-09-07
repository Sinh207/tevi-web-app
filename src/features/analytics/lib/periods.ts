/**
 * The time window the dashboard is reporting on — the five periods, the range each resolves to,
 * the bucket size that range implies, and the window it is compared against.
 *
 * Everything here is a **pure function of a `Date`**. Nothing reads the clock on its own, so a test
 * can state "on 19 Feb, `30d` means these two instants" and the screen has one place where the day
 * arithmetic lives. Legacy spreads the same maths over three files (`hook/index.js`,
 * `timePeriodSelector`, `dateRangeDisplay`) and the three disagree about whether the count is
 * inclusive — its comparison label is off by a day whenever the picker is used.
 *
 * ## Local calendar days, not UTC — the opposite call to the earnings report
 *
 * `formatEarningsDate` pins UTC because a row there is a *calendar day the server bucketed*. A
 * range here is a question the **reader** is asking: "the last 30 days" means their own 30 days,
 * ending at tonight's midnight where they are sitting, which is what legacy sends and what the
 * timezone caption on the screen promises. So the boundaries are local and the caption says which
 * zone they are in. Consequence: nothing in this file may be rendered during SSR — see
 * `DashboardAnalyticsView`, which waits for mount before drawing any of it.
 *
 * Day arithmetic goes through the date *components* (`new Date(y, m, d - n)`) rather than
 * subtracting 86_400_000, so a range that crosses a DST boundary still starts at midnight. The
 * millisecond form silently produces 23:00 or 01:00 twice a year, which shifts a bucket boundary.
 */

import { rangeDayCount as sharedRangeDayCount } from '@shared/lib/date-range'

/** A closed interval, in epoch milliseconds: `[startMs, endMs]`. */
export interface DateRange {
    /** Local midnight of the first day. */
    startMs: number
    /** Local 23:59:59.999 of the last day. */
    endMs: number
}

/**
 * The five choices in the period control.
 *
 * `custom` carries no range of its own — `resolvePeriodRange` returns `null` for it and the range
 * comes from the picker. It is still a period rather than a separate flag so that the control
 * always has exactly one selected segment: a segmented control whose selection can be empty puts
 * every segment at `tabIndex={-1}` and becomes unreachable by keyboard.
 */
export type PeriodId = 'yesterday' | '7d' | '30d' | '90d' | 'custom'

export const PERIOD_IDS: readonly PeriodId[] = ['yesterday', '7d', '30d', '90d', 'custom']

/** The one the screen opens on, matching legacy's `useState(30)`. */
export const DEFAULT_PERIOD: PeriodId = '30d'

/** How many days each fixed period covers, inclusive of today. `null` where there is no fixed span. */
const PERIOD_DAYS: Record<PeriodId, number | null> = {
    yesterday: 1,
    '7d': 7,
    '30d': 30,
    '90d': 90,
    custom: null,
}

/** The translation key for each period's label. `s_days` takes the day count as `[%s]`. */
export const PERIOD_LABEL_KEYS: Record<PeriodId, string> = {
    yesterday: 'analytics_period_yesterday',
    '7d': 'analytics_period_days',
    '30d': 'analytics_period_days',
    '90d': 'analytics_period_days',
    custom: 'analytics_period_custom',
}

/** The `[%s]` substitution for `analytics_period_days`, or `null` for the two literal labels. */
export function periodDayCount(period: PeriodId): number | null {
    return period === 'yesterday' || period === 'custom' ? null : PERIOD_DAYS[period]
}

export function startOfDay(date: Date): Date {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0)
}

export function endOfDay(date: Date): Date {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999)
}

/** `n` calendar days before `date`, at the same wall-clock time. DST-safe; see the file header. */
export function subDays(date: Date, n: number): Date {
    return new Date(
        date.getFullYear(),
        date.getMonth(),
        date.getDate() - n,
        date.getHours(),
        date.getMinutes(),
        date.getSeconds(),
        date.getMilliseconds(),
    )
}

/**
 * The window a fixed period means, given "now".
 *
 * `yesterday` is the whole of yesterday — **not** the last 24 hours. That is what legacy asks for
 * and what the label says; a rolling 24h window would put half of today in a bucket called
 * Yesterday and make the comparison against "the day before" overlap it.
 *
 * The others end **tonight**, so today is included and is the reason the last bucket of a 7-day
 * chart is usually short. Legacy does the same and the design draws it that way.
 *
 * `null` for `custom`: there is nothing to resolve, the picker holds the answer.
 */
export function resolvePeriodRange(period: PeriodId, now: Date): DateRange | null {
    const days = PERIOD_DAYS[period]
    if (days === null) return null
    if (period === 'yesterday') {
        const yesterday = subDays(now, 1)
        return { startMs: startOfDay(yesterday).getTime(), endMs: endOfDay(yesterday).getTime() }
    }
    return { startMs: startOfDay(subDays(now, days - 1)).getTime(), endMs: endOfDay(now).getTime() }
}

/** A range from two dates the picker produced, snapped to whole local days and ordered. */
export function customRange(from: Date, to: Date): DateRange {
    const [earlier, later] = from.getTime() <= to.getTime() ? [from, to] : [to, from]
    return { startMs: startOfDay(earlier).getTime(), endMs: endOfDay(later).getTime() }
}

/** Whole days between the two ends, truncated — legacy's `differenceInDays(end, start)`. */
function spanDays(range: DateRange): number {
    return Math.floor((range.endMs - range.startMs) / 86_400_000)
}

/**
 * How many calendar days a range covers, **inclusive**: yesterday is 1, not 0.
 *
 * Delegates to `shared/lib/date-range.ts`, which is where the rule and its two traps (an end at
 * 23:59:59.999, and a day that is 23 or 25 hours long across a DST change) are written down and
 * tested. This screen and the date-range picker must never disagree about how long a range is — they
 * are shown one above the other, and they did: the dialog said 31 days over the summary's 30.
 */
export function rangeDayCount(range: DateRange): number {
    return sharedRangeDayCount({ from: new Date(range.startMs), to: new Date(range.endMs) }) ?? 1
}

/**
 * The bucket size sent as `hour_interval` — hourly for a single day, daily up to a month, weekly
 * beyond.
 *
 * Ported from legacy verbatim, thresholds included, because the backend aggregates on this number
 * and the chart's X labels are chosen from it. A 90-day range at `hour_interval: 24` is 90 points
 * in a 300px-wide plot; at 168 it is 13, which is what the design draws.
 */
export function hourIntervalFor(range: DateRange): 1 | 24 | 168 {
    const days = spanDays(range)
    if (days <= 1) return 1
    if (days <= 30) return 24
    return 168
}

/**
 * The window "Compare" measures against — the same number of days, ending the day before this
 * range starts.
 *
 * The backend computes its own comparison (`prev_points`, `last_duration_compare_percent`); this
 * is only the **caption** that tells the reader which dates those figures cover. It is still
 * derived here rather than guessed at in the component, because the arithmetic is the fiddly part:
 * legacy computes `subDays(compEnd, days - 1)` from a day count it took from a *different*
 * expression than the one it labels the range with, so its two lines disagree by a day on the
 * `yesterday` period.
 */
export function comparisonRange(range: DateRange): DateRange {
    const days = rangeDayCount(range)
    const end = endOfDay(subDays(new Date(range.startMs), 1))
    const start = startOfDay(subDays(end, days - 1))
    return { startMs: start.getTime(), endMs: end.getTime() }
}

/**
 * The reader's UTC offset, as the caption prints it — `GMT +7`, `GMT +5:30`, `GMT -3:30`, `GMT +0`.
 *
 * Half-hour and 45-minute zones are real (India +5:30, Nepal +5:45, Chatham +12:45) and legacy
 * renders them as `GMT +5.5` / `GMT +5.75`, which reads as a broken number rather than a zone. The
 * minutes are printed as minutes here.
 *
 * Takes the offset in the shape `Date.prototype.getTimezoneOffset` gives it — **minutes west of
 * UTC**, so a positive value means *behind* UTC — because that is the only source for it and
 * flipping the sign at the call site is exactly the mistake this signature prevents.
 */
export function formatGmtOffset(offsetMinutesWestOfUtc: number): string {
    const minutesEast = -offsetMinutesWestOfUtc
    const sign = minutesEast < 0 ? '-' : '+'
    const abs = Math.abs(minutesEast)
    const hours = Math.floor(abs / 60)
    const minutes = abs % 60
    return `GMT ${sign}${hours}${minutes ? `:${String(minutes).padStart(2, '0')}` : ''}`
}

/**
 * `?start_date_ts=…&end_date_ts=…` — the deep link the mobile app opens this screen with.
 *
 * Kept because links to it exist outside this repo and the cutover is same-origin. Both values are
 * epoch **milliseconds**, matching what legacy reads and what it sends back to the API.
 *
 * Anything that is not a pair of positive finite numbers is `null` — the params come off the URL,
 * so `?start_date_ts='; DROP` is a request somebody will make. A `null` simply means the screen
 * opens on its default period, which is what visiting it without params does.
 *
 * A range whose end is in the future is **clamped to tonight** rather than rejected: an app that
 * sends `Date.now()` from a device whose clock is a few minutes fast is the common case, and
 * dropping the whole deep link over it would be worse than honouring the day it names.
 */
export function parseRangeParams(
    startParam: string | null,
    endParam: string | null,
    now: Date,
): DateRange | null {
    const start = Number(startParam)
    const end = Number(endParam)
    if (!startParam || !endParam) return null
    if (!Number.isFinite(start) || !Number.isFinite(end) || start <= 0 || end <= 0) return null
    const todayEnd = endOfDay(now).getTime()
    const range = customRange(
        new Date(Math.min(start, todayEnd)),
        new Date(Math.min(end, todayEnd)),
    )
    return range
}
