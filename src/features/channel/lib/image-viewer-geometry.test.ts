import { describe, expect, it } from 'vitest'
import { containRect, dragProgress, sourceKeyframe } from './image-viewer-geometry'

function parse(frame: Keyframe) {
    const t = String(frame.transform).match(/translate\((.+)px, (.+)px\) scale\((.+)\)/)
    const c = String(frame.clipPath).match(/inset\((.+)px (.+)px round (.+)px\)/)
    if (!t || !c) throw new Error('unparseable keyframe')
    return {
        dx: Number(t[1]),
        dy: Number(t[2]),
        scale: Number(t[3]),
        insetY: Number(c[1]),
        insetX: Number(c[2]),
        radius: Number(c[3]),
    }
}

describe('containRect', () => {
    it('runs a wide cover to the bezels on a phone, centred vertically', () => {
        const r = containRect(1206, 420, 390, 844)
        expect(r.x).toBe(0)
        expect(r.w).toBe(390)
        expect(r.h).toBeCloseTo(135.8, 1)
        expect(r.y + r.h / 2).toBeCloseTo(422)
    })

    it('keeps a gutter from sm up and is height-bound for a tall image', () => {
        const r = containRect(500, 1000, 1280, 800)
        expect(r.h).toBe(800 - 96)
        expect(r.w).toBe(352)
        expect(r.x + r.w / 2).toBe(640)
    })

    it('draws an unknown size square instead of dividing by zero', () => {
        const r = containRect(0, 0, 390, 844)
        expect(r.w).toBe(r.h)
    })
})

describe('sourceKeyframe', () => {
    it('lands the visible region exactly on the source box', () => {
        // A 3:1 avatar contained on a phone, starting from an 80px circle.
        const target = containRect(1015, 338, 390, 844)
        const source = { x: 12, y: 100, w: 80, h: 80 }
        const k = parse(sourceKeyframe(target, source, 40))

        // Visible box after the clip, on screen.
        const visW = (target.w - 2 * k.insetX) * k.scale
        const visH = (target.h - 2 * k.insetY) * k.scale
        expect(visW).toBeCloseTo(80)
        expect(visH).toBeCloseTo(80)
        // Centres coincide.
        expect(target.x + target.w / 2 + k.dx).toBeCloseTo(52)
        expect(target.y + target.h / 2 + k.dy).toBeCloseTo(140)
        // The radius is in the frame's own units.
        expect(k.radius * k.scale).toBeCloseTo(40)
    })

    it('clips nothing when the source already has the image’s ratio', () => {
        const target = containRect(1206, 420, 390, 844)
        const k = parse(sourceKeyframe(target, { x: 0, y: 0, w: 390, h: 390 * (420 / 1206) }, 0))
        expect(k.insetX).toBeCloseTo(0)
        expect(k.insetY).toBeCloseTo(0)
        expect(k.scale).toBeCloseTo(1)
    })
})

describe('dragProgress', () => {
    it('is symmetric and saturates', () => {
        expect(dragProgress(-160)).toBe(dragProgress(160))
        expect(dragProgress(10_000)).toBe(1)
    })
})
