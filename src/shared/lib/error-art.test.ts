import { describe, expect, it } from 'vitest'
import { committedArt } from './committed-art'
import { ERROR_ART, ERROR_BACKDROP_SRC } from './error-art'

/**
 * The 404 and 500 screens draw local files, and this is the only thing that says so.
 *
 * It matters more here than on any feature's art. These two frames render when something has
 * already gone wrong — a 500 while an upstream is unwell, a 404 for a crawler — and a `src` that
 * silently went back to the CDN looks identical in every review and every dev server. Three of the
 * four failures it catches (a stale path, a file committed in the wrong format, a truncated write)
 * are invisible until the page is served.
 */
const ART = [
    ['404', ERROR_ART.notFound.src],
    ['500', ERROR_ART.failed.src],
    ['backdrop', ERROR_BACKDROP_SRC],
] as const

describe('error illustrations', () => {
    it.each(ART)('%s is committed, in the format it claims', (_name, src) => {
        const art = committedArt(src)
        expect(art.isDeclaredFormat).toBe(true)
        expect(art.bytes).toBeGreaterThan(512)
    })

    it.each(ART)('%s is served from our own origin', (_name, src) => {
        expect(committedArt(src).isLocal).toBe(true)
    })

    /**
     * All three arrive as raster, and must stay that way. Every one of them is a Figma image layer
     * or a CSS background upstream — `next/image` passes a remote SVG through unprocessed and never
     * sees a background at all, which is how the backdrop came to be **825 KB** on the wire.
     */
    it('keeps every piece out of SVG', () => {
        for (const [, src] of ART) expect(src).not.toMatch(/\.svg$/)
    })

    /**
     * The backdrop is the whole viewport's ground, so it is the one piece where a size regression is
     * a real cost rather than a rounding error. It encodes to ~11 KB; 60 KB is loose enough to
     * survive a re-encode and tight enough to catch somebody committing the source PNG.
     */
    it('keeps the backdrop cheap enough to be a page background', () => {
        expect(committedArt(ERROR_BACKDROP_SRC).bytes).toBeLessThan(60 * 1024)
    })
})
