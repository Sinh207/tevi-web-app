import { describe, expect, it } from 'vitest'
import { createPictureTracker, measureSample, PICTURE_SAMPLE_SIZE } from './picture-activity'

const PIXELS = PICTURE_SAMPLE_SIZE * PICTURE_SAMPLE_SIZE

function frame(fill: (i: number) => number): Uint8ClampedArray {
    const rgba = new Uint8ClampedArray(PIXELS * 4)
    for (let p = 0; p < PIXELS; p++) {
        const v = fill(p)
        rgba.set([v, v, v, 255], p * 4)
    }
    return rgba
}

/** Feeds frames through measure + tracker the way the player does. */
function run(frames: Uint8ClampedArray[]) {
    const track = createPictureTracker()
    let previous: Uint8ClampedArray | null = null
    const out: (boolean | null)[] = []
    for (const f of frames) {
        out.push(track(measureSample(f, previous)))
        previous = f
    }
    return out
}

describe('picture activity', () => {
    it('cannot call a still picture dead before it has a full window', () => {
        const still = frame(p => 60 + (p % 50))
        // The first sample has nothing to compare against, so it reads as moving.
        expect(run([still, still, still])).toEqual([true, null, null])
    })

    it('calls a moving picture alive on every sample', () => {
        const noisy = (seed: number) => frame(p => 100 + ((p * 7 + seed * 13) % 40))
        expect(run([1, 2, 3, 4, 5, 6].map(noisy))).toEqual([true, true, true, true, true, true])
    })

    it('calls a held frame dead once the window is all still', () => {
        const still = frame(p => 60 + (p % 50))
        expect(run([still, still, still, still, still, still]).at(-1)).toBe(false)
    })

    it('calls black dead on the very first sample, even if encoder noise moves it', () => {
        const black = (seed: number) => frame(p => (p + seed) % 3)
        expect(run([1, 2, 3].map(black))).toEqual([false, false, false])
    })

    it('does not mistake a dim room for black', () => {
        // Dark on average, but with edges in it — and moving.
        const dim = (seed: number) => frame(p => ((p + seed) % 24 < 4 ? 40 : 1))
        expect(run([1, 2, 3, 4].map(dim)).at(-1)).toBe(true)
    })

    it('calls a camera coming back alive on the first frame that moves', () => {
        const black = frame(() => 0)
        const live = (seed: number) => frame(p => 100 + ((p * 7 + seed * 13) % 40))
        expect(run([black, black, live(1), live(2)])).toEqual([false, false, true, true])
    })
})
