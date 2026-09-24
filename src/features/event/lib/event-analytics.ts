/**
 * The **analytics** figures on a creator's event report — counts, and two durations.
 */

/** A count for display. `null` prints `0`, which on an analytics row is the honest reading. */
export function formatCount(value: number | null | undefined, locale = 'en'): string {
    const count = typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : 0
    try {
        return new Intl.NumberFormat(locale).format(count)
    } catch {
        return new Intl.NumberFormat('en').format(count)
    }
}

/**
 * `HH:MM:SS` from a count of **seconds**.
 *
 * ## ⚠ Legacy wraps at 24 hours, silently
 *
 * ```js
 * new Date(seconds * 1000).toISOString().substring(11, 19)
 * ```
 *
 * That is a *time of day* extracted from an epoch, so it is modulo 24 hours: a 25-hour broadcast
 * reads **`01:00:00`** and a 24-hour one reads `00:00:00`. `live_duration` is per-event and rarely
 * that long, but **`total_view_duration` is every viewer's watch time added together** — it passes
 * 24 hours the moment a stream has a handful of viewers for an hour, which is to say on essentially
 * every real broadcast. So the field that wraps is the one that always wraps.
 *
 * Here the hours are not bounded: 25 hours is `25:00:00`, and 1,000 hours is `1000:00:00`. Minutes
 * and seconds stay two digits, which is what makes the string still scannable as a duration.
 *
 * `00:00:00` for `null`, `0` and anything unparseable — a stream that has not started has a
 * duration of nothing, and legacy prints the same.
 */
export function formatDuration(seconds: number | null | undefined): string {
    const total =
        typeof seconds === 'number' && Number.isFinite(seconds)
            ? Math.max(0, Math.floor(seconds))
            : 0
    const hours = Math.floor(total / 3600)
    const minutes = Math.floor((total % 3600) / 60)
    const secs = total % 60
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${pad(hours)}:${pad(minutes)}:${pad(secs)}`
}
