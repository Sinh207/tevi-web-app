import { committedArt } from '@shared/lib/committed-art'
import { describe, expect, it } from 'vitest'
import { STAR_TRANSFER_ART, STAR_TRANSFER_EMPTY_ART } from './illustrations'

/**
 * The four pieces are **generated but committed** (`pnpm art:cdn`, `pnpm art:star-transfer`), so they
 * can go stale in the one way nothing catches: a file the module names is missing, or was committed
 * as something other than the format it claims. Neither breaks a build, a typecheck or a lint —
 * `next/image` 404s at request time and the screen renders a gap where the art was.
 *
 * It does not re-encode to compare bytes: the inputs live on a CDN, and a test that reaches the
 * network fails on a train. Measuring the CDN is `pnpm art:audit`'s job.
 */
const ART = [
    ['denied', STAR_TRANSFER_ART.denied.src],
    ['success', STAR_TRANSFER_ART.success.src],
    ['balance backdrop', STAR_TRANSFER_ART.balance],
    ['empty state', STAR_TRANSFER_EMPTY_ART.src],
] as const

describe('star-transfer illustrations', () => {
    it.each(ART)('%s is committed, in the format it claims', (_name, src) => {
        const art = committedArt(src)
        expect(art.isDeclaredFormat).toBe(true)
        // A truncated or placeholder write is the other silent failure.
        expect(art.bytes).toBeGreaterThan(512)
    })

    /**
     * A regression fence, not a style rule: `denied` and `success` were 2.89 MB and 1.26 MB
     * **because** they were remote `.svg` — a format `next/image` passes through unprocessed. And
     * `balance` is a CSS `background-image`, the case the optimiser never sees at all, so a remote
     * URL there is fetched byte for byte no matter what it weighs.
     */
    it.each(ART)('%s is served from our own origin', (_name, src) => {
        expect(committedArt(src).isLocal).toBe(true)
    })

    it('keeps the re-encoded pieces out of SVG', () => {
        expect(STAR_TRANSFER_ART.denied.src).not.toMatch(/\.svg$/)
        expect(STAR_TRANSFER_ART.success.src).not.toMatch(/\.svg$/)
    })

    /**
     * The empty state deliberately stays a vector — 9 KB of real paths, nothing to re-encode — and
     * points at the copy `features/earnings` already committed rather than a second one.
     */
    it('shares earnings’ copy of theo-search rather than duplicating it', () => {
        expect(STAR_TRANSFER_EMPTY_ART.src).toBe('/illustrations/theo-search.svg')
    })

    /**
     * The declared box reserves the layout and fixes the encode width (the script renders 2× it), so a
     * wrong number here either stretches the art or ships pixels no screen can ask for.
     */
    it('declares legacy’s boxes', () => {
        expect(STAR_TRANSFER_ART.denied.width).toBe(276)
        expect(STAR_TRANSFER_ART.success.width).toBe(74)
        expect(STAR_TRANSFER_EMPTY_ART.width).toBe(120)
    })
})
