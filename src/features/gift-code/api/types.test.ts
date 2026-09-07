import { describe, expect, it } from 'vitest'
import { toGiftOutcome } from './types'

/**
 * Both bodies behind this screen are undocumented, and the two failures worth pinning are the ones
 * that would be *silent*: a redemption reported as a refusal, and a refusal reported as a redemption.
 */

describe('toGiftOutcome', () => {
    it('reads a Star gift', () => {
        expect(
            toGiftOutcome({ object: { type: 'STAR_GIFT', data: { star_quantity: 500 } } }),
        ).toEqual({ kind: 'star', stars: 500 })
    })

    /** Legacy lower-cases the type; the wire has been seen in both cases. */
    it('does not care how the type is cased', () => {
        expect(
            toGiftOutcome({ object: { type: 'star_gift', data: { star_quantity: '250.00' } } }),
        ).toEqual({ kind: 'star', stars: 250 })
    })

    /**
     * A product this client has no panel for. The code was still spent, so this is a redemption —
     * reporting it as invalid would tell somebody their spent code was never used.
     */
    it('reports an unrecognised product as a redemption it cannot itemise', () => {
        expect(toGiftOutcome({ object: { type: 'GIFT_PACKAGE', data: { id: 'p1' } } })).toEqual({
            kind: 'other',
        })
    })

    it('falls back rather than announcing a Star gift of zero', () => {
        expect(toGiftOutcome({ object: { type: 'STAR_GIFT', data: {} } })).toEqual({
            kind: 'other',
        })
        expect(toGiftOutcome({ object: { type: 'STAR_GIFT', data: null } })).toEqual({
            kind: 'other',
        })
    })

    /**
     * The one case that must **not** read as success: a 200 with nothing in it. Legacy requires
     * `object` too, and it is right to — see the note on `toGiftOutcome`.
     */
    it('has nothing to report for a body that describes no redemption', () => {
        expect(toGiftOutcome({})).toBeNull()
        expect(toGiftOutcome({ object: null })).toBeNull()
        expect(toGiftOutcome(null)).toBeNull()
        expect(toGiftOutcome('')).toBeNull()
    })
})
