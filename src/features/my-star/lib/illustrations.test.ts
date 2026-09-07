import { committedArt } from '@shared/lib/committed-art'
import { describe, expect, it } from 'vitest'
import { MY_STAR_ART } from './illustrations'

/**
 * Committed rather than fetched (`pnpm art:cdn no-star-transactions`). This one was never over any
 * budget — 26 KB of raster, which `next/image` handled fine — so the assertion that matters is
 * simply that it is *local*: the rule is that no static art comes from the CDN, not that heavy art
 * does. `docs/STATIC_ASSETS.md` has the reasoning.
 */
describe('my-star illustrations', () => {
    it('ships the empty state as a committed WebP', () => {
        const art = committedArt(MY_STAR_ART.empty.src)
        expect(art.isLocal).toBe(true)
        expect(art.isDeclaredFormat).toBe(true)
        expect(art.bytes).toBeGreaterThan(512)
    })

    /** The declared box reserves the layout; the encode is pinned to it (here at 1×, per the source). */
    it('declares legacy’s box', () => {
        expect(MY_STAR_ART.empty.width).toBe(225)
        expect(MY_STAR_ART.empty.height).toBe(256)
    })
})
