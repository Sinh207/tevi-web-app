import { describe, expect, it } from 'vitest'
import {
    clampRange,
    fullRange,
    isTrimmed,
    MIN_TRIM_SECONDS,
    moveEnd,
    moveStart,
    rangeDuration,
    rangeStyle,
    secondsAt,
} from './trim-range'

describe('fullRange', () => {
    it('spans the clip', () => {
        expect(fullRange(30)).toEqual({ start: 0, end: 30 })
    })

    /** A clip shorter than the floor still has to produce a valid range for the handles to sit on. */
    it('never returns a selection under the floor', () => {
        expect(rangeDuration(fullRange(0.4))).toBe(MIN_TRIM_SECONDS)
        expect(rangeDuration(fullRange(0))).toBe(MIN_TRIM_SECONDS)
    })
})

describe('clampRange', () => {
    it('pulls a range back inside the clip', () => {
        expect(clampRange({ start: -5, end: 99 }, 30)).toEqual({ start: 0, end: 30 })
    })

    /**
     * ⚠ The case a fast drag produces. `end` is clamped against the **clamped** start, so an
     * inverted range comes back as a valid one-second selection — clamping them independently
     * yields a negative width, which the style attribute renders as no band at all.
     */
    it('rights an inverted range instead of returning a negative width', () => {
        const righted = clampRange({ start: 20, end: 5 }, 30)
        expect(righted.end).toBeGreaterThan(righted.start)
        expect(rangeDuration(righted)).toBe(MIN_TRIM_SECONDS)
    })

    it('survives NaN, which is what an unmeasured strip produces', () => {
        const range = clampRange({ start: Number.NaN, end: Number.NaN }, 30)
        expect(Number.isFinite(range.start)).toBe(true)
        expect(Number.isFinite(range.end)).toBe(true)
        expect(range.end).toBeGreaterThan(range.start)
    })
})

describe('moveStart / moveEnd', () => {
    it('moves the handle it is given and holds the other', () => {
        expect(moveStart({ start: 0, end: 30 }, 10, 30)).toEqual({ start: 10, end: 30 })
        expect(moveEnd({ start: 10, end: 30 }, 20, 30)).toEqual({ start: 10, end: 20 })
    })

    /**
     * ⚠ Dragging one handle past the other must **not** swap them. A trimmer whose handles change
     * identity mid-drag leaves the pointer holding something other than what it grabbed, which
     * reads as the selection jumping away.
     */
    it('stops one second short rather than swapping the handles', () => {
        const pushed = moveStart({ start: 0, end: 10 }, 25, 30)
        expect(pushed).toEqual({ start: 10 - MIN_TRIM_SECONDS, end: 10 })

        const pulled = moveEnd({ start: 20, end: 30 }, 2, 30)
        expect(pulled).toEqual({ start: 20, end: 20 + MIN_TRIM_SECONDS })
    })

    it('stays inside the clip at both ends', () => {
        expect(moveStart({ start: 0, end: 30 }, -10, 30).start).toBe(0)
        expect(moveEnd({ start: 0, end: 30 }, 999, 30).end).toBe(30)
    })
})

describe('rangeStyle', () => {
    it('places the band as percentages', () => {
        expect(rangeStyle({ start: 15, end: 30 }, 30)).toEqual({ left: '50%', width: '50%' })
        expect(rangeStyle({ start: 0, end: 30 }, 30)).toEqual({ left: '0%', width: '100%' })
    })

    /** The band can never run past the strip, whatever arithmetic produced the range. */
    it('never exceeds the strip', () => {
        const { left, width } = rangeStyle({ start: 29, end: 99 }, 30)
        expect(Number.parseFloat(left) + Number.parseFloat(width)).toBeLessThanOrEqual(100.001)
    })
})

describe('isTrimmed', () => {
    /**
     * ⚠ This is what keeps *Save* off on an untouched clip. Without it the button runs ffmpeg —
     * 24 MB of core, seconds of work — to produce a file identical to the one already attached.
     */
    it('is false for the whole clip and true once either handle moves', () => {
        expect(isTrimmed({ start: 0, end: 30 }, 30)).toBe(false)
        expect(isTrimmed({ start: 1, end: 30 }, 30)).toBe(true)
        expect(isTrimmed({ start: 0, end: 29 }, 30)).toBe(true)
    })

    /** Drag arithmetic lands on 0.0001, not 0. A hair off the end is not a trim. */
    it('ignores sub-hundredth drift', () => {
        expect(isTrimmed({ start: 0.001, end: 29.999 }, 30)).toBe(false)
    })
})

describe('secondsAt', () => {
    it('maps a pointer along the strip to a time', () => {
        const strip = { left: 100, width: 300 }
        expect(secondsAt(100, strip, 30)).toBe(0)
        expect(secondsAt(250, strip, 30)).toBe(15)
        expect(secondsAt(400, strip, 30)).toBe(30)
    })

    /** A pointer dragged off either edge pins to that edge rather than running off the clip. */
    it('clamps outside the strip', () => {
        const strip = { left: 100, width: 300 }
        expect(secondsAt(-500, strip, 30)).toBe(0)
        expect(secondsAt(5000, strip, 30)).toBe(30)
    })

    /** A strip measured before layout has zero width; dividing by it would give NaN handles. */
    it('answers zero for an unmeasured strip', () => {
        expect(secondsAt(250, { left: 0, width: 0 }, 30)).toBe(0)
    })
})
