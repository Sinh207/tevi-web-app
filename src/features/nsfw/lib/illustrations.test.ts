import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { NSFW_APPEAL_ART } from './illustrations'

/**
 * Committed art goes stale in the one way nothing else catches: the file a module names is missing,
 * or was committed as something other than the format it claims. Neither breaks a build, a typecheck
 * or a lint — the screen simply renders a gap where the picture was.
 */
const root = process.cwd()

describe('nsfw illustrations', () => {
    const entries = Object.entries(NSFW_APPEAL_ART)

    it.each(entries)('%s is committed, and is really an SVG', (_name, art) => {
        const data = readFileSync(join(root, 'public', art.src)).toString('utf8')
        expect(data).toContain('<svg')
        /*
         * The failure this catches is the *other* kind of SVG: a wrapper around a base64 raster,
         * which is how `no-blocked-accounts.svg` came to be 2.18 MB. This one is paths.
         */
        expect(data).not.toContain('base64')
        expect(data.length).toBeGreaterThan(1024)
    })

    it.each(entries)('%s declares the box Figma draws it at', (_name, art) => {
        expect(art.width).toBe(75)
        expect(art.height).toBe(104)
        expect(art.src.startsWith('/illustrations/nsfw/')).toBe(true)
    })

    /** Nothing here may point back at a CDN — that is the whole point of committing it. */
    it('serves every file from our own origin', () => {
        for (const [, art] of entries) expect(art.src).not.toMatch(/^https?:/)
    })
})
