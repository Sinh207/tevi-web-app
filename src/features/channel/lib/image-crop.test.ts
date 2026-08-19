import { describe, expect, it } from 'vitest'
import {
    clampOffset,
    coverScale,
    cropRect,
    displayedSize,
    outputSize,
    zoomOffset,
} from './image-crop'

/**
 * The cropper's arithmetic.
 *
 * Worth testing rather than eyeballing because every one of these bugs *looks* fine in the
 * dialog: a wrong sign crops the mirror of what was shown, a wrong clamp lets a transparent edge
 * into the saved picture, and both are invisible until someone opens the published profile.
 */

const LANDSCAPE = { width: 4000, height: 2000 }
const SQUARE_VIEW = { width: 400, height: 400 }
const WIDE_VIEW = { width: 480, height: 270 }

describe('coverScale', () => {
    it('fills the viewport on the constraining axis', () => {
        // 400/2000 = 0.2 is the height-driven scale; the width would only need 0.1.
        expect(coverScale(LANDSCAPE, SQUARE_VIEW)).toBeCloseTo(0.2)
    })

    it('does not divide by zero on an image that has not loaded', () => {
        expect(coverScale({ width: 0, height: 0 }, SQUARE_VIEW)).toBe(1)
    })
})

describe('displayedSize', () => {
    it('covers at zoom 1 — never smaller than the window on either axis', () => {
        const size = displayedSize(LANDSCAPE, SQUARE_VIEW, 1)
        expect(size.width).toBeGreaterThanOrEqual(SQUARE_VIEW.width)
        expect(size.height).toBeGreaterThanOrEqual(SQUARE_VIEW.height)
    })
})

describe('clampOffset', () => {
    it('pins the axis that fits exactly, so no edge can be exposed', () => {
        // A 2:1 image in a 16:9 window at zoom 1: height is the constraining axis, so vertical
        // travel is zero.
        const clamped = clampOffset({ x: 0, y: 500 }, LANDSCAPE, WIDE_VIEW, 1)
        expect(clamped.y).toBe(0)
    })

    it('allows travel on the overflowing axis, up to half the overflow', () => {
        const displayed = displayedSize(LANDSCAPE, SQUARE_VIEW, 1)
        const limit = (displayed.width - SQUARE_VIEW.width) / 2
        expect(clampOffset({ x: 99_999, y: 0 }, LANDSCAPE, SQUARE_VIEW, 1).x).toBeCloseTo(limit)
        expect(clampOffset({ x: -99_999, y: 0 }, LANDSCAPE, SQUARE_VIEW, 1).x).toBeCloseTo(-limit)
    })

    it('gives more travel as the zoom grows', () => {
        const near = clampOffset({ x: 99_999, y: 99_999 }, LANDSCAPE, SQUARE_VIEW, 1)
        const far = clampOffset({ x: 99_999, y: 99_999 }, LANDSCAPE, SQUARE_VIEW, 2)
        expect(far.x).toBeGreaterThan(near.x)
        expect(far.y).toBeGreaterThan(near.y)
    })
})

describe('cropRect', () => {
    it('is centred and square when nothing has been moved', () => {
        const rect = cropRect({
            natural: LANDSCAPE,
            viewport: SQUARE_VIEW,
            zoom: 1,
            offset: { x: 0, y: 0 },
        })
        expect(rect).toEqual({ x: 1000, y: 0, width: 2000, height: 2000 })
    })

    /**
     * The sign. Dragging the image to the right reveals what is on its **left**, so the source
     * rectangle has to move left — a positive `x` offset must produce a *smaller* `rect.x`.
     */
    it('moves the source rectangle opposite to the drag', () => {
        const dragged = cropRect({
            natural: LANDSCAPE,
            viewport: SQUARE_VIEW,
            zoom: 1,
            offset: { x: 100, y: 0 },
        })
        expect(dragged.x).toBeLessThan(1000)
    })

    it('never reads outside the bitmap, however hard it is dragged', () => {
        const rect = cropRect({
            natural: LANDSCAPE,
            viewport: SQUARE_VIEW,
            zoom: 1,
            offset: { x: -99_999, y: -99_999 },
        })
        expect(rect.x).toBeGreaterThanOrEqual(0)
        expect(rect.y).toBeGreaterThanOrEqual(0)
        expect(rect.x + rect.width).toBeLessThanOrEqual(LANDSCAPE.width)
        expect(rect.y + rect.height).toBeLessThanOrEqual(LANDSCAPE.height)
    })

    it('takes a smaller source region as the zoom grows', () => {
        const near = cropRect({
            natural: LANDSCAPE,
            viewport: SQUARE_VIEW,
            zoom: 1,
            offset: { x: 0, y: 0 },
        })
        const far = cropRect({
            natural: LANDSCAPE,
            viewport: SQUARE_VIEW,
            zoom: 2,
            offset: { x: 0, y: 0 },
        })
        expect(far.width).toBeLessThan(near.width)
    })

    it('keeps the viewport’s aspect ratio', () => {
        const rect = cropRect({
            natural: LANDSCAPE,
            viewport: WIDE_VIEW,
            zoom: 1.4,
            offset: { x: 30, y: 0 },
        })
        expect(rect.width / rect.height).toBeCloseTo(WIDE_VIEW.width / WIDE_VIEW.height, 1)
    })
})

describe('outputSize', () => {
    it('leaves a small crop alone rather than upscaling it', () => {
        expect(outputSize({ width: 300, height: 300 })).toEqual({ width: 300, height: 300 })
    })

    it('caps the long edge and keeps the ratio', () => {
        const size = outputSize({ width: 4000, height: 2000 })
        expect(size.width).toBe(1600)
        expect(size.height).toBe(800)
    })
})

describe('zoomOffset', () => {
    /** Zooming toward the centre is the degenerate case, and it is a plain scale of the pan. */
    it('scales the pan when the focal point is the centre', () => {
        expect(zoomOffset({ x: 40, y: -20 }, { x: 0, y: 0 }, 1, 2)).toEqual({ x: 80, y: -40 })
    })

    /**
     * The property that makes a wheel zoom feel right: whatever is under the cursor stays under
     * it. Expressed as the screen position of the image point that was there before the zoom.
     */
    it('keeps the point under the focal point where it is', () => {
        const offset = { x: 30, y: 10 }
        const focal = { x: 120, y: -60 }
        const from = 1.2
        const to = 2.4

        // The image point under `focal`, in scale-independent units.
        const point = { x: (focal.x - offset.x) / from, y: (focal.y - offset.y) / from }
        const next = zoomOffset(offset, focal, from, to)

        expect(next.x + point.x * to).toBeCloseTo(focal.x)
        expect(next.y + point.y * to).toBeCloseTo(focal.y)
    })

    it('is a no-op when the zoom does not move', () => {
        expect(zoomOffset({ x: 5, y: 5 }, { x: 50, y: 50 }, 1.5, 1.5)).toEqual({ x: 5, y: 5 })
    })

    it('does not divide by a zero starting zoom', () => {
        expect(zoomOffset({ x: 5, y: 5 }, { x: 0, y: 0 }, 0, 2)).toEqual({ x: 5, y: 5 })
    })
})
