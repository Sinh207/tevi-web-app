import { committedArt } from '@shared/lib/committed-art'
import { describe, expect, it } from 'vitest'
import { NOTIFICATION_ART } from './illustrations'

/**
 * The empty inbox is the second piece `build-cdn-art.mjs` **copies** rather than re-encodes (the
 * card-scheme strip is the first): a genuine 17.8 KB vector, where rasterising would only make it
 * soft. It is local because `next/image` passes a remote SVG through unchanged, so a cross-origin
 * fetch on a screen somebody is waiting on buys nothing at all.
 */
describe('notification illustrations', () => {
    it('ships the empty-inbox art from our own origin, still as a vector', () => {
        const art = committedArt(NOTIFICATION_ART.empty.src)
        expect(art.isLocal).toBe(true)
        expect(art.isDeclaredFormat).toBe(true)
        expect(art.bytes).toBeGreaterThan(512)
    })

    /** A committed file is versioned by the commit it landed in; a query string would only defeat
     *  the immutable caching `public/` gets. */
    it('names the file with no cache-busting query', () => {
        expect(NOTIFICATION_ART.empty.src).not.toContain('?')
    })
})
