import { committedArt } from '@shared/lib/committed-art'
import { describe, expect, it } from 'vitest'
import { DONATION_ART, DONATION_SUCCESS_ART } from './illustrations'

/**
 * All five pieces are generated-but-committed (`pnpm art:cdn`). The fence that matters is the last
 * test: the four unit icons were 20–22 KB **each** on the wire because Brand's `.svg` exports are
 * raster wrappers, and `next/image` passes a remote SVG through unprocessed. A channel page draws all
 * four, so a revert costs 87 KB and looks identical on screen.
 */
const ART = [
    ['coffee', DONATION_ART.coffee],
    ['pizza', DONATION_ART.pizza],
    ['book', DONATION_ART.book],
    ['rose', DONATION_ART.rose],
    ['success', DONATION_SUCCESS_ART.src],
] as const

describe('donation illustrations', () => {
    it.each(ART)('%s is committed, and is a WebP', (_name, src) => {
        const art = committedArt(src)
        expect(art.isDeclaredFormat).toBe(true)
        expect(art.bytes).toBeGreaterThan(512)
    })

    it.each(ART)('%s is served from our own origin, not the CDN', (_name, src) => {
        expect(committedArt(src).isLocal).toBe(true)
        expect(src).not.toMatch(/\.svg$/)
    })

    /**
     * `DonationArt` indexes this map with the offer's `icon`, so a key the backend can send and this
     * map has lost would fall through to the generic gift glyph — the art disappearing quietly rather
     * than loudly. Four is legacy's set; a fifth is a backend change, not a rename.
     */
    it('still covers all four of legacy’s icons', () => {
        expect(Object.keys(DONATION_ART).sort()).toEqual(['book', 'coffee', 'pizza', 'rose'])
    })
})
