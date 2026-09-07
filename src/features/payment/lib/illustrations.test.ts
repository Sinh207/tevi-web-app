import { committedArt } from '@shared/lib/committed-art'
import { describe, expect, it } from 'vitest'
import { CARD_MANAGEMENT_ART } from './illustrations'

/**
 * The scheme strip is the one piece `build-cdn-art.mjs` copies rather than re-encodes: it is a real
 * vector, and rasterising a row of card-scheme logos would make it soft at exactly the DPR it is read
 * at. It is local anyway because a remote SVG is **passed through** `next/image` unchanged — 45 KB
 * landing in the browser on the screen that holds card details.
 */
describe('card-management illustrations', () => {
    it('ships the scheme strip from our own origin, still as a vector', () => {
        const art = committedArt(CARD_MANAGEMENT_ART.schemes.src)
        expect(art.isLocal).toBe(true)
        expect(art.isDeclaredFormat).toBe(true)
        expect(art.bytes).toBeGreaterThan(512)
    })

    /**
     * The empty state, re-encoded. `?v5` — legacy's cache-buster on the CDN URL — is gone with the
     * URL: a committed file is versioned by the commit it landed in, and a query string on a
     * `public/` path would only defeat the immutable caching.
     */
    it('ships the empty-state illustration as a committed WebP, with no query string', () => {
        const art = committedArt(CARD_MANAGEMENT_ART.empty.src)
        expect(art.isLocal).toBe(true)
        expect(art.isDeclaredFormat).toBe(true)
        expect(CARD_MANAGEMENT_ART.empty.src).not.toContain('?')
    })
})
