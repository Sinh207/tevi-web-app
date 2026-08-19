import { describe, expect, it } from 'vitest'
import { nearestIndex } from './card-carousel'

/**
 * `nearestIndex` is the whole of the carousel that can be silently wrong: everything else is
 * scroll-snap, which the browser owns. The cases below are the four it has to get right —
 * left-to-right, right-to-left (where the offsets descend), a drag stopped between two slides,
 * and a track that has not been laid out yet.
 */
describe('nearestIndex', () => {
    it('picks the slide parked at the leading edge (LTR)', () => {
        // Three 300-wide slides, scrolled to the second: its left edge is at the track's.
        expect(nearestIndex([-300, 0, 300], 0)).toBe(1)
        expect(nearestIndex([0, 300, 600], 0)).toBe(0)
        expect(nearestIndex([-600, -300, 0], 0)).toBe(2)
    })

    it('needs no direction flag in RTL, where the offsets descend', () => {
        // Same three slides in an `ar` document: slide 0 is the rightmost, so the array runs the
        // other way. The rule — closest to the origin — is unchanged, which is the point.
        expect(nearestIndex([0, -300, -600], 0)).toBe(0)
        expect(nearestIndex([300, 0, -300], 0)).toBe(1)
    })

    it('does not flicker mid-drag: an exact tie goes to the earlier slide', () => {
        expect(nearestIndex([-150, 150], 0)).toBe(0)
        // Just past halfway, the second slide wins — one stable answer either side of the tie.
        expect(nearestIndex([-151, 149], 0)).toBe(1)
    })

    it('skips offsets that are not numbers instead of comparing against NaN', () => {
        // Every comparison with NaN is false, so an unguarded `<` would keep index 0 forever.
        expect(nearestIndex([Number.NaN, 0, 300], 0)).toBe(1)
        expect(nearestIndex([Number.NaN, Number.NaN], 0)).toBe(0)
        expect(nearestIndex([], 0)).toBe(0)
    })
})
