import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { GIFT_CODE_ART } from './illustrations'

/**
 * The art is **generated but committed** (`pnpm art:gift-code`), so it can go stale in the one way
 * that is invisible until somebody opens the page: a file the module names is missing, or was
 * committed as something other than the format it claims. Neither breaks a build, a typecheck or a
 * lint — `next/image` 404s at request time and the screen renders a gap.
 *
 * This does not re-encode to compare bytes, the way `sprite.test.ts` regenerates the sprite: the
 * inputs live on a CDN, and a test that reaches the network fails on a train.
 */
const root = process.cwd()

/** `RIFF....WEBP` — the container's magic, which is what "is it really a WebP" means. */
function isWebp(data: Buffer): boolean {
    return (
        data.subarray(0, 4).toString('ascii') === 'RIFF' &&
        data.subarray(8, 12).toString('ascii') === 'WEBP'
    )
}

describe('gift-code illustrations', () => {
    const entries = Object.entries(GIFT_CODE_ART)

    it.each(entries)('%s is committed, and is a WebP', (_name, art) => {
        const data = readFileSync(join(root, 'public', art.src))
        expect(isWebp(data)).toBe(true)
        // A truncated or placeholder write is the other silent failure.
        expect(data.length).toBeGreaterThan(1024)
    })

    /**
     * The declared box is what reserves layout space, so a wrong aspect ratio stretches the art. Both
     * result illustrations are Brand's 190×127; the banner is its 451×256.
     */
    it.each(entries)('%s declares its intrinsic box', (_name, art) => {
        expect(art.width).toBeGreaterThan(0)
        expect(art.height).toBeGreaterThan(0)
        expect(art.src.startsWith('/illustrations/gift-code/')).toBe(true)
    })

    /** Nothing here may point back at the CDN — that is the whole point of the re-encode. */
    it('serves every file from our own origin', () => {
        for (const [, art] of entries) expect(art.src).not.toMatch(/^https?:/)
    })
})
