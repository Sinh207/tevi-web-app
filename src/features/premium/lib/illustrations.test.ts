import { committedArt } from '@shared/lib/committed-art'
import { describe, expect, it } from 'vitest'
import { GIFT_PREMIUM_ART, PREMIUM_ART } from './illustrations'

/**
 * Both files are **generated but committed**, so they go stale in the one way nothing else catches:
 * a file this module names is missing, or was committed as something other than the format it
 * claims. Neither breaks a build, a typecheck or a lint — `next/image` 404s at request time and the
 * hero renders a gap, and the backdrop simply does not appear.
 *
 * The mark is also the largest saving in the repo (2.53 MB → 16 KB), which makes a silent revert to
 * the CDN URL expensive rather than merely wrong — hence the explicit "not remote" assertion.
 */
const ART = Object.entries(PREMIUM_ART)
const GIFT_ART = Object.entries(GIFT_PREMIUM_ART)

describe('premium illustrations', () => {
    it.each(ART)('%s is committed, in the format it claims', (_name, art) => {
        const file = committedArt(art.src)
        expect(file.isLocal).toBe(true)
        expect(file.isDeclaredFormat).toBe(true)
        expect(file.bytes).toBeGreaterThan(1024)
    })

    it.each(ART)('%s declares the box the screen reserves for it', (_name, art) => {
        expect(art.width).toBeGreaterThan(0)
        expect(art.height).toBeGreaterThan(0)
        expect(art.src.startsWith('/illustrations/premium/')).toBe(true)
    })

    /** Nothing here may point back at the CDN — that is the whole point of the re-encode. */
    it('serves every file from our own origin', () => {
        for (const [, art] of ART) expect(art.src).not.toMatch(/^https?:/)
    })

    /**
     * The gift screen's two, checked the same way — and **not** asserted to live under
     * `/illustrations/premium/`, because one of them deliberately does not: `theo-search.svg` is the
     * shared file three other features already point at, and copying it under this feature's folder
     * to satisfy a test would put a fifth copy of the same drawing in `public/`.
     */
    it.each(GIFT_ART)('gift %s is committed, in the format it claims', (_name, art) => {
        const file = committedArt(art.src)
        expect(file.isLocal).toBe(true)
        expect(file.isDeclaredFormat).toBe(true)
        expect(file.bytes).toBeGreaterThan(1024)
        expect(art.width).toBeGreaterThan(0)
        expect(art.height).toBeGreaterThan(0)
        expect(art.src).not.toMatch(/^https?:/)
    })
})
