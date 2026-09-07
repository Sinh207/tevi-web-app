import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * The brand font is **generated but committed** (`pnpm fonts`: `design-system/fonts/*.ttf` →
 * `public/fonts/chella/*.woff2`), so it fails the same way the icon sprite would — the file
 * `fonts.ts` names is missing, or was committed as something other than what it claims. Neither
 * breaks a build or a typecheck; the wordmark just silently falls back to Inter, which looks like a
 * design decision rather than a missing asset.
 *
 * `fonts.ts` itself is not imported here: `next/font/local` only resolves inside the Next compiler,
 * so importing it in Vitest throws. The path is asserted as a string instead, which is the thing
 * that can actually drift.
 */
const root = process.cwd()
const OUT_DIR = join(root, 'public/fonts/chella')

describe('brand font', () => {
    it('is committed as a real WOFF2', () => {
        const data = readFileSync(join(OUT_DIR, 'Chella-Bold.woff2'))
        // `wOF2` — the container's magic. A TTF renamed to `.woff2` is rejected by the browser.
        expect(data.subarray(0, 4).toString('ascii')).toBe('wOF2')
        expect(data.length).toBeGreaterThan(1024)
    })

    it('is the file fonts.ts points at', () => {
        const source = readFileSync(join(root, 'src/shared/config/fonts.ts'), 'utf8')
        expect(source).toContain('public/fonts/chella/Chella-Bold.woff2')
    })

    /**
     * A regression fence with a number behind it: the TTF was 374 KB, and `next/font/local` ships
     * whatever it is given. Committing a `.ttf` back into `public/fonts/` — or shipping an
     * uncompressed WOFF2 — puts that back on the splash screen, where every visitor pays it.
     */
    it('serves nothing but the compressed face', () => {
        const files = readdirSync(OUT_DIR)
        expect(files).toEqual(['Chella-Bold.woff2'])
    })

    /**
     * The DS type scale is 400/500/600/700, so 800 and 900 are unreachable by construction. This
     * pins the *source* side of that: three TTFs in `design-system/fonts/` would mean somebody
     * re-added a weight without the DS growing one, and `pnpm fonts` would silently ship it.
     */
    it('keeps one unserved source face in design-system/', () => {
        expect(readdirSync(join(root, 'design-system/fonts'))).toEqual(['Chella-Bold.ttf'])
    })
})
