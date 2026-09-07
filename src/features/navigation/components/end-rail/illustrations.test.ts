import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { committedArt } from '@shared/lib/committed-art'
import { describe, expect, it } from 'vitest'
import { RAIL_ART } from './illustrations'

/**
 * The rail renders beside every page, so these two are the app's most-requested images — and they
 * were two cross-origin requests on a third party's uptime before anything had drawn. Committed by
 * `pnpm art:cdn`; `login` is copied as a vector, `premium` is re-encoded from a 190×188 PNG.
 */
const ART = [
    ['login', RAIL_ART.login],
    ['premium', RAIL_ART.premium],
] as const

describe('end-rail illustrations', () => {
    it.each(ART)('%s is committed, in the format it claims', (_name, art) => {
        const file = committedArt(art.src)
        expect(file.isLocal).toBe(true)
        expect(file.isDeclaredFormat).toBe(true)
        expect(file.bytes).toBeGreaterThan(512)
    })

    it.each(ART)('%s declares the box PromoCard reserves for it', (_name, art) => {
        expect(art.width).toBeGreaterThan(0)
        expect(art.height).toBeGreaterThan(0)
    })

    /**
     * `PromoCard` reserves `width`×`height`, and Tailwind's preflight (`img { height: auto }`) then
     * has the browser draw the file's **own** ratio into it — so a declared box of a different shape
     * is a layout shift, and a silent one. It is what `login` was: declared a flat 70 square by
     * legacy while the vector is 72×74. Read off the file so a re-export cannot drift from it.
     */
    it('login declares the vector’s own ratio', () => {
        const svg = readFileSync(join(process.cwd(), 'public', RAIL_ART.login.src), 'utf8')
        const [, width, height] = svg.match(/<svg[^>]*width="(\d+)"[^>]*height="(\d+)"/) ?? []
        expect(RAIL_ART.login.width / RAIL_ART.login.height).toBeCloseTo(
            Number(width) / Number(height),
            3,
        )
    })
})
