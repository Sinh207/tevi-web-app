import { committedArt } from '@shared/lib/committed-art'
import { describe, expect, it } from 'vitest'
import { QR_SIGN_IN_STEPS, TWO_FA_ART } from './illustrations'

/**
 * Generated-but-committed (`pnpm art:cdn scan-qr-step-1 scan-qr-step-2`), and worth guarding more
 * than most: these two are the only explanation of how QR sign-in is used. A missing file leaves the
 * code on screen with nothing saying what to do with it, and neither a build nor a typecheck notices
 * — `next/image` 404s at request time and the row renders as a gap.
 */
const STEPS = QR_SIGN_IN_STEPS.map((art, index) => [index + 1, art] as const)

describe('QR sign-in step art', () => {
    it.each(STEPS)('step %i is committed, and is a WebP', (_step, art) => {
        const file = committedArt(art.src)
        expect(file.isDeclaredFormat).toBe(true)
        expect(file.bytes).toBeGreaterThan(512)
    })

    it.each(STEPS)('step %i is served from our own origin', (_step, art) => {
        // The regression this exists for: a `src` quietly pointed back at `static.tevi.dev`, which
        // works locally and puts a cross-origin fetch on the sign-in screen.
        expect(committedArt(art.src).isLocal).toBe(true)
    })

    /**
     * Both boxes have to match, and match the encode. They are drawn as two equal grid columns, so a
     * pair that disagrees is two different-sized phones side by side — and `build-cdn-art.mjs`
     * renders 2× these numbers, so a wrong one also ships the wrong pixels.
     */
    it('declares one box for both columns, at the source ratio', () => {
        const [first, second] = QR_SIGN_IN_STEPS
        expect(first.width).toBe(second.width)
        expect(first.height).toBe(second.height)
        // 814×661 is what Brand published; within a pixel of it means nothing is stretched.
        expect(Math.abs(first.width / first.height - 814 / 661)).toBeLessThan(0.01)
    })
})

/**
 * The two-step-verification mark, which is the one illustration in this repo that is **not** a
 * `build-cdn-art.mjs` row — it came out of the design file (Figma node `1077:80750`) because it was
 * never published to the CDN. That makes the committed file the only copy, and this test the only
 * thing standing between a lost file and two screens whose art silently 404s at request time.
 */
describe('two-step verification art', () => {
    it('is committed, and is a WebP', () => {
        const file = committedArt(TWO_FA_ART.src)
        expect(file.isDeclaredFormat).toBe(true)
        expect(file.bytes).toBeGreaterThan(512)
    })

    it('is served from our own origin', () => {
        expect(committedArt(TWO_FA_ART.src).isLocal).toBe(true)
    })

    /**
     * The declared box is the comps' 190×127 (node `1077:80750`), and it fixes the encode width at 2×
     * — so a wrong number here either stretches the art or ships pixels no screen can use. The source
     * raster is 1536×1024, whose ratio the box keeps to within a pixel.
     */
    it("declares the comps' box, at the source ratio", () => {
        expect(TWO_FA_ART.width).toBe(190)
        expect(TWO_FA_ART.height).toBe(127)
        expect(Math.abs(TWO_FA_ART.width / TWO_FA_ART.height - 1536 / 1024)).toBeLessThan(0.01)
    })
})
