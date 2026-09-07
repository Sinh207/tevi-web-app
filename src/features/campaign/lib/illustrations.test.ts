import { committedArt } from '@shared/lib/committed-art'
import { describe, expect, it } from 'vitest'
import { CAMPAIGN_ART } from './illustrations'

/**
 * All three are committed (`pnpm art:cdn`). The fence that matters is the second test: `growYourFans`
 * was **2.27 MB** on the wire *because* it was a remote `.svg`, a format `next/image` passes through
 * unprocessed. Pointing any of them back at the CDN looks identical on screen — that is exactly why
 * it needs an assertion rather than a review.
 */
const ART = [
    ['grow-your-fans', CAMPAIGN_ART.growYourFans],
    ['lucky-wheel', CAMPAIGN_ART.luckyWheel.src],
    ['affiliate fallback', CAMPAIGN_ART.affiliateFallback],
] as const

describe('campaign illustrations', () => {
    it.each(ART)('%s is committed, in the format it claims', (_name, src) => {
        const art = committedArt(src)
        expect(art.isDeclaredFormat).toBe(true)
        expect(art.bytes).toBeGreaterThan(512)
    })

    it.each(ART)('%s is served from our own origin', (_name, src) => {
        expect(committedArt(src).isLocal).toBe(true)
    })

    /**
     * The re-encoded pair must not go back to being SVG: that is the format `next/image` cannot
     * shrink, and both of these were raster-in-SVG exports before.
     */
    it('keeps the re-encoded pair out of SVG', () => {
        expect(CAMPAIGN_ART.growYourFans).not.toMatch(/\.svg$/)
        expect(CAMPAIGN_ART.luckyWheel.src).not.toMatch(/\.svg$/)
    })
})
