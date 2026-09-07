import { describe, expect, it } from 'vitest'
import {
    clampPosition,
    clampRect,
    defaultRect,
    MIN_HEIGHT,
    MIN_WIDTH,
    type Rect,
    resizeRect,
    WINDOW_ASPECT_RATIO,
} from './window-geometry'

const DESKTOP = { width: 1440, height: 900 }

describe('defaultRect', () => {
    it('is as tall as the viewport allows, with the width following the ratio, centred', () => {
        const rect = defaultRect(DESKTOP)
        expect(rect.height).toBe(900 - 32)
        expect(rect.width).toBe(Math.round(rect.height * WINDOW_ASPECT_RATIO))
        expect(rect.x).toBe(Math.round((1440 - rect.width) / 2))
    })

    it('never returns a negative position on a viewport smaller than the minimum', () => {
        // A short landscape phone. The caller goes full-screen there; this must still be sane.
        const rect = defaultRect({ width: 200, height: 300 })
        expect(rect.x).toBeGreaterThanOrEqual(0)
        expect(rect.y).toBeGreaterThanOrEqual(0)
        expect(rect.width).toBeGreaterThanOrEqual(MIN_WIDTH)
        expect(rect.height).toBeGreaterThanOrEqual(MIN_HEIGHT)
    })
})

describe('clampPosition', () => {
    it('keeps the window on screen', () => {
        const rect: Rect = { x: 5000, y: 5000, width: 400, height: 700 }
        expect(clampPosition(rect, DESKTOP)).toEqual({ x: 1040, y: 200, width: 400, height: 700 })
    })

    it('pins a window wider than the viewport to the start edge, not off it', () => {
        // `viewport.width - rect.width` is negative here; clamping to it would push the tab strip —
        // the only thing you can drag the window by — off screen.
        expect(clampPosition({ x: 40, y: 0, width: 2000, height: 700 }, DESKTOP).x).toBe(0)
    })
})

describe('clampRect', () => {
    it('fits an oversized window from a wider monitor into a narrow one', () => {
        const rect = clampRect(
            { x: 1400, y: 20, width: 900, height: 1600 },
            { width: 800, height: 600 },
        )
        expect(rect.width).toBeLessThanOrEqual(800)
        expect(rect.height).toBeLessThanOrEqual(600)
        expect(rect.x).toBe(0)
    })
})

describe('resizeRect', () => {
    const start: Rect = { x: 400, y: 100, width: 420, height: 730 }
    /** Tall enough that the ratio cases are not also viewport-clamp cases. */
    const TALL = { width: 1440, height: 1400 }

    it('drives from width on a horizontal handle and keeps the ratio', () => {
        const rect = resizeRect({ direction: 'e', start, delta: { x: 100, y: 0 }, viewport: TALL })
        expect(rect.width).toBe(520)
        expect(rect.height).toBe(Math.round(520 / WINDOW_ASPECT_RATIO))
    })

    it('drives from height on a pure vertical handle', () => {
        const rect = resizeRect({ direction: 's', start, delta: { x: 0, y: -100 }, viewport: TALL })
        expect(rect.height).toBe(630)
        expect(rect.width).toBe(Math.round(630 * WINDOW_ASPECT_RATIO))
    })

    it('is bounded by the viewport height, losing width rather than shape', () => {
        // The same drag on a 900-tall screen: the height clamp wins and the width comes back down.
        const rect = resizeRect({
            direction: 'e',
            start,
            delta: { x: 100, y: 0 },
            viewport: DESKTOP,
        })
        expect(rect.height).toBe(DESKTOP.height)
        expect(rect.width).toBe(Math.round(DESKTOP.height * WINDOW_ASPECT_RATIO))
    })

    it('moves the origin by exactly what the size lost when dragging the west side', () => {
        // Computing the origin from the pointer delta instead is the classic drift: the ratio
        // correction changes the size by more than the pointer moved, and the window creeps.
        const rect = resizeRect({
            direction: 'w',
            start,
            delta: { x: 60, y: 0 },
            viewport: DESKTOP,
        })
        expect(rect.x).toBe(start.x + (start.width - rect.width))
    })

    it('does not shrink past the minimum, and does not deform to get there', () => {
        const rect = resizeRect({
            direction: 'e',
            start,
            delta: { x: -5000, y: 0 },
            viewport: DESKTOP,
        })
        expect(rect.width).toBe(MIN_WIDTH)
        expect(rect.height).toBe(Math.round(MIN_WIDTH / WINDOW_ASPECT_RATIO))
    })

    it('loses width rather than shape when it hits the bottom of the viewport', () => {
        const rect = resizeRect({
            direction: 'se',
            start,
            delta: { x: 5000, y: 5000 },
            viewport: DESKTOP,
        })
        expect(rect.height).toBeLessThanOrEqual(DESKTOP.height)
        expect(rect.width).toBe(Math.round(rect.height * WINDOW_ASPECT_RATIO))
    })

    it('leaves the resized window fully on screen', () => {
        const rect = resizeRect({
            direction: 'se',
            start: { x: 1300, y: 800, width: 300, height: 420 },
            delta: { x: 400, y: 400 },
            viewport: DESKTOP,
        })
        expect(rect.x + rect.width).toBeLessThanOrEqual(DESKTOP.width)
        expect(rect.y + rect.height).toBeLessThanOrEqual(DESKTOP.height)
    })
})
