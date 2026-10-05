import { describe, expect, it } from 'vitest'
import { needsChromeClearance, type Rect } from './stage-clearance'

function rect(left: number, top: number, width: number, height: number): Rect {
    return { left, top, width, height, right: left + width, bottom: top + height }
}

/** A 1500×700 stage, with the two plates where a real broadcast measured them. */
const STAGE = rect(0, 0, 1500, 700)
const LEADING = rect(12, 12, 500, 40)
const TRAILING = rect(1100, 12, 388, 40)

describe('needsChromeClearance', () => {
    it('lets a narrow portrait box use the full height — it sits between the plates', () => {
        // 9:16 at 676px tall is ~380px wide, centred: 560–940, clear of both plates.
        expect(
            needsChromeClearance({ stage: STAGE, ratio: 9 / 16, chrome: [LEADING, TRAILING] }),
        ).toBe(false)
    })

    it('drops a wide box below the chrome', () => {
        expect(
            needsChromeClearance({ stage: STAGE, ratio: 3 / 2, chrome: [LEADING, TRAILING] }),
        ).toBe(true)
    })

    it('drops even a portrait box when the stage is narrow enough that a plate reaches it', () => {
        const narrow = rect(0, 0, 1000, 700)
        // 9:16 is 380 wide, centred at 310–690; the leading plate runs to 512 and overlaps it.
        expect(needsChromeClearance({ stage: narrow, ratio: 9 / 16, chrome: [LEADING] })).toBe(true)
    })

    it('ignores a plate the box clears vertically', () => {
        // A wide but short box sits low enough in a tall stage to pass under nothing.
        const tall = rect(0, 0, 900, 1400)
        expect(needsChromeClearance({ stage: tall, ratio: 16 / 9, chrome: [LEADING] })).toBe(false)
    })

    it('ignores a plate that is not rendered', () => {
        expect(
            needsChromeClearance({ stage: STAGE, ratio: 3 / 2, chrome: [rect(0, 0, 0, 0)] }),
        ).toBe(false)
    })
})
