/**
 * The arithmetic behind a trimmer's two handles — pure, so it can be stated rather than dragged.
 *
 * Separate from the component because every rule here is a **claim about a race**: a handle dragged
 * past its partner, a handle dragged past the end of the clip, a selection squeezed to nothing, a
 * *Save* offered on a range that would cut nothing. None of those is visible in a screenshot and
 * each of them is a sentence in a test.
 */

export interface TrimRange {
    /** Seconds from the start of the clip. */
    start: number
    /** Seconds from the start of the clip, always `> start`. */
    end: number
}

/**
 * The shortest selection the handles may produce.
 *
 * One second, which is legacy's floor. Below that a stream copy has no keyframe to start on often
 * enough that the result is a clip of zero frames — a file that uploads and then plays as nothing.
 */
export const MIN_TRIM_SECONDS = 1

/** Two ranges that differ by less than this are the same range, after float drag arithmetic. */
const EPSILON = 0.01

/** The whole clip — where a trimmer opens, and what *Reset* goes back to. */
export function fullRange(duration: number): TrimRange {
    return { start: 0, end: Math.max(MIN_TRIM_SECONDS, duration) }
}

/**
 * Pull a range back inside the clip, keeping the minimum length.
 *
 * The order matters: `start` is clamped first and `end` then clamped **against the clamped start**,
 * so a range that arrives inverted (`end < start`, which a fast drag across the other handle
 * produces) comes back as a valid one-second selection rather than as a negative width.
 */
export function clampRange(range: TrimRange, duration: number): TrimRange {
    const total = Math.max(MIN_TRIM_SECONDS, duration)
    const start = clamp(range.start, 0, Math.max(0, total - MIN_TRIM_SECONDS))
    const end = clamp(range.end, start + MIN_TRIM_SECONDS, total)
    return { start, end }
}

/**
 * Move the leading handle, holding the trailing one.
 *
 * Dragging it past the other does **not** swap them — the selection stops one second short. A
 * trimmer whose handles swap identity mid-drag leaves the pointer holding a different handle than
 * the one it grabbed, which reads as the selection jumping.
 */
export function moveStart(range: TrimRange, seconds: number, duration: number): TrimRange {
    const total = Math.max(MIN_TRIM_SECONDS, duration)
    const end = clamp(range.end, MIN_TRIM_SECONDS, total)
    return { start: clamp(seconds, 0, end - MIN_TRIM_SECONDS), end }
}

/** Move the trailing handle, holding the leading one. Same no-swap rule. */
export function moveEnd(range: TrimRange, seconds: number, duration: number): TrimRange {
    const total = Math.max(MIN_TRIM_SECONDS, duration)
    const start = clamp(range.start, 0, Math.max(0, total - MIN_TRIM_SECONDS))
    return { start, end: clamp(seconds, start + MIN_TRIM_SECONDS, total) }
}

/** How long the selection is. */
export function rangeDuration(range: TrimRange): number {
    return Math.max(0, range.end - range.start)
}

/** Where the selected band sits on the strip, as percentages the style attribute can take. */
export function rangeStyle(range: TrimRange, duration: number): { left: string; width: string } {
    const total = Math.max(MIN_TRIM_SECONDS, duration)
    const { start, end } = clampRange(range, total)
    const left = (start / total) * 100
    const width = ((end - start) / total) * 100
    return { left: `${left}%`, width: `${Math.min(width, 100 - left)}%` }
}

/**
 * Whether saving this range would actually change the clip.
 *
 * Legacy's `isSaveDisabled`, inverted. A range that still spans the whole clip would run ffmpeg to
 * produce a copy of the input — 24 MB of core loaded, seconds of work, and a file identical to the
 * one already attached. The button is off instead, which is also the honest thing to show: nothing
 * has been trimmed yet.
 */
export function isTrimmed(range: TrimRange, duration: number): boolean {
    const total = Math.max(MIN_TRIM_SECONDS, duration)
    const { start, end } = clampRange(range, total)
    return start > EPSILON || end < total - EPSILON
}

/** Where a pointer at `clientX` lands on a strip, in seconds. */
export function secondsAt(
    clientX: number,
    strip: { left: number; width: number },
    duration: number,
): number {
    if (!(strip.width > 0)) return 0
    const ratio = clamp((clientX - strip.left) / strip.width, 0, 1)
    return ratio * Math.max(MIN_TRIM_SECONDS, duration)
}

function clamp(value: number, min: number, max: number): number {
    if (!Number.isFinite(value)) return min
    return Math.max(min, Math.min(max, value))
}
