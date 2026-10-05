import { describe, expect, it } from 'vitest'
import { SEAT_LAYOUT_CODES, seatArrangement, seatBoxAspect, seatBoxStyle } from './seat-layout'

/**
 * **Who gets a tile, and where.**
 *
 * The failure this file exists for is the one legacy has in three places and nobody reported: a
 * person is in the room, publishing video, and simply is not on screen. Nothing errors, the grid
 * looks perfectly composed, and the only way to notice is to count heads.
 */
describe('the table itself', () => {
    /**
     * ⚠ The digit in a code is an **id**, not a seat count — `P3` draws two tiles. Pinned here
     * because reading it as a headcount is the obvious mistake, and every arrangement still looks
     * plausible once it has been made.
     */
    it('does not treat the digit as a seat count', () => {
        expect(seatArrangement({ layout: 'P3', publisherCount: 1 }).areas).toHaveLength(2)
        expect(seatArrangement({ layout: 'P5', publisherCount: 1 }).areas).toHaveLength(4)
        expect(seatArrangement({ layout: 'P7', publisherCount: 1 }).areas).toHaveLength(6)
        expect(seatArrangement({ layout: 'L8', publisherCount: 1 }).areas).toHaveLength(6)
    })

    it('covers all eighteen codes', () => {
        expect(SEAT_LAYOUT_CODES).toHaveLength(18)
        for (const code of ['P1', 'P9', 'L1', 'L9']) {
            expect(SEAT_LAYOUT_CODES).toContain(code)
        }
    })

    /*
     * Every area must be a well-formed `row / col / rowEnd / colEnd` inside a 6-column grid with
     * the arrangement's declared row count. A typo here is a tile that silently lands on top of
     * its neighbour.
     */
    it('keeps every seat inside its own grid', () => {
        for (const code of SEAT_LAYOUT_CODES) {
            const a = seatArrangement({ layout: code, publisherCount: 1 })
            for (const area of a.areas) {
                const [r1, c1, r2, c2] = area.split('/').map(n => Number(n.trim()))
                expect(Number.isFinite(r1 + c1 + r2 + c2), `${code}: ${area}`).toBe(true)
                expect(r2, `${code}: ${area}`).toBeGreaterThan(r1)
                expect(c2, `${code}: ${area}`).toBeGreaterThan(c1)
                expect(c2, `${code}: ${area}`).toBeLessThanOrEqual(7)
                expect(r2, `${code}: ${area}`).toBeLessThanOrEqual(a.rows + 1)
            }
        }
    })

    /* No two seats may claim the same cell — that is one person drawn over another. */
    it('never overlaps two seats', () => {
        for (const code of SEAT_LAYOUT_CODES) {
            const a = seatArrangement({ layout: code, publisherCount: 1 })
            const taken = new Set<string>()
            for (const area of a.areas) {
                const [r1, c1, r2, c2] = area.split('/').map(n => Number(n.trim()))
                for (let r = r1; r < r2; r++) {
                    for (let c = c1; c < c2; c++) {
                        const cell = `${r}:${c}`
                        expect(taken.has(cell), `${code} overlaps at ${cell}`).toBe(false)
                        taken.add(cell)
                    }
                }
            }
        }
    })
})

describe('picking an arrangement', () => {
    it('uses the code the room reports', () => {
        expect(seatArrangement({ layout: 'P4', publisherCount: 4 }).areas).toHaveLength(4)
        expect(seatArrangement({ layout: 'L9', publisherCount: 9 }).areas).toHaveLength(9)
    })

    /** Legacy's own `componentMap[layoutType] || P1`. */
    it('falls back to a single tile for a code it has never seen', () => {
        expect(seatArrangement({ layout: 'X7', publisherCount: 1 }).areas).toHaveLength(1)
        expect(seatArrangement({ layout: null, publisherCount: 1 }).areas).toHaveLength(1)
    })

    /** Spotlight *means* one tile — legacy short-circuits to `P1` the same way. */
    it('collapses to one tile under spotlight, whatever the code says', () => {
        const a = seatArrangement({ layout: 'L9', publisherCount: 9, spotlight: true })
        expect(a.areas).toHaveLength(1)
    })

    /**
     * ⚠ **The deliberate divergence**, and the case that documents the digit.
     *
     * `P3` draws **two** tiles, not three — the number in a layout code is an *id*, not a
     * headcount, and `P3` is the one that proves it. So a room can legitimately hold more people
     * than its code's arrangement has boxes, and legacy simply does not draw them.
     */
    it('never drops a publisher when the room has more people than the arrangement has tiles', () => {
        for (const [code, count] of [
            ['P3', 3],
            ['P5', 5],
            ['P7', 7],
            ['L8', 8],
            ['P4', 6],
        ] as const) {
            const a = seatArrangement({ layout: code, publisherCount: count })
            expect(a.areas.length, `${code} with ${count}`).toBe(count)
        }
    })

    /* The stage must not also change shape when the grid inside it does. */
    it('keeps the named arrangement’s box when it falls back', () => {
        expect(seatArrangement({ layout: 'L7', publisherCount: 7 }).box).toBe('landscape')
        expect(seatArrangement({ layout: 'P7', publisherCount: 7 }).box).toBe('portrait-grid')
    })

    /* Nine is the ceiling the layout vocabulary itself stops at. */
    it('caps at nine tiles', () => {
        expect(seatArrangement({ layout: 'P9', publisherCount: 14 }).areas).toHaveLength(9)
    })

    it('does not fall back when the room is smaller than the arrangement', () => {
        expect(seatArrangement({ layout: 'P9', publisherCount: 2 }).areas).toHaveLength(9)
    })
})

describe('the stage box aspect', () => {
    /**
     * ⚠ The values below are legacy's container expressions, not a ratio computed from the tiles.
     * This function briefly derived the box as `cols × rows × tile aspect`, which gave every
     * landscape family its own shape (`32/18`, `48/18`, `12/6`) where legacy has exactly one.
     */
    it('gives every landscape family the same 16:9 box', () => {
        for (const code of ['L1', 'L4', 'L5', 'L6', 'L7', 'L8', 'L9']) {
            expect(seatBoxAspect(seatArrangement({ layout: code, publisherCount: 1 }))).toBe(
                '16 / 9',
            )
        }
    })

    it('gives a multi-tile portrait grid a square box, not a 9:16 column', () => {
        for (const code of ['P4', 'P5', 'P6', 'P7', 'P8', 'P9']) {
            expect(seatBoxAspect(seatArrangement({ layout: code, publisherCount: 1 }))).toBe(
                '1 / 1',
            )
        }
    })

    /*
     * The deliberate divergence: legacy's square split in two is a pair of 1:2 strips. A 3:2 box
     * makes each of the two tiles 3:4.
     */
    it('gives P2 a 3:2 box, so its two tiles are 3:4 rather than legacy’s 1:2 strips', () => {
        expect(seatBoxAspect(seatArrangement({ layout: 'P2', publisherCount: 2 }))).toBe('3 / 2')
    })

    it('keeps P1 a 9:16 column and P3 a half-width one', () => {
        expect(seatBoxAspect(seatArrangement({ layout: 'P1', publisherCount: 1 }))).toBe('9 / 16')
        expect(seatBoxAspect(seatArrangement({ layout: 'P3', publisherCount: 2 }))).toBe('1 / 2')
    })

    /** The two that measure their own — two 16:9 side by side, and two 9:16 side by side. */
    it('honours the per-layout override', () => {
        expect(seatBoxAspect(seatArrangement({ layout: 'L2', publisherCount: 2 }))).toBe('32 / 9')
        expect(seatBoxAspect(seatArrangement({ layout: 'L3', publisherCount: 2 }))).toBe('18 / 16')
    })

    /** Spotlight collapses to `P1`, so the stage becomes one portrait tile whatever the code was. */
    it('follows a spotlight collapse', () => {
        expect(
            seatBoxAspect(seatArrangement({ layout: 'L4', publisherCount: 4, spotlight: true })),
        ).toBe('9 / 16')
    })
})

describe('the stage box style', () => {
    /**
     * ⚠ Measured in a browser: a box carrying only `aspect-ratio` plus `max-width`/`max-height`,
     * centred in a flex parent, resolves to **0×0** at every ratio — it has no definite dimension
     * to derive the other from. The width rule is what gives it one, and it is the pair of this
     * and `container-type: size` on the stage area that works, never either alone.
     */
    it('carries a width rule, not only a ratio', () => {
        const style = seatBoxStyle(seatArrangement({ layout: 'P1', publisherCount: 1 }))
        expect(style.aspectRatio).toBe('9 / 16')
        expect(style.width).toBe('min(100cqw, calc(100cqh * 0.5625))')
    })

    /** The factor is the box's own ratio, so a wide arrangement is bounded by the area's width. */
    it('scales the factor with the arrangement', () => {
        expect(seatBoxStyle(seatArrangement({ layout: 'L6', publisherCount: 6 })).width).toContain(
            String(16 / 9),
        )
        expect(seatBoxStyle(seatArrangement({ layout: 'L2', publisherCount: 2 })).width).toContain(
            String(32 / 9),
        )
    })
})
