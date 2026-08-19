import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * The drawer's row tiles are themed through custom properties: `LeftBarRow` writes
 * them as an inline style, `ListLeadingTile` reads them with a `var(…, fallback)`.
 *
 * Nothing connects the two but the spelling, and getting it wrong fails **silently** —
 * `var()` just takes the fallback, so all 26 tiles render the same Indigo and the page
 * still looks plausible. That has already happened once, during a rename. This asserts
 * the two sides agree, and that the names are the design system's own (`--tevi-left-bar-*`)
 * so markup copied out of a DS preview or a design comp keeps working.
 */
const read = (p: string) => readFileSync(join(process.cwd(), 'src/shared/ui', p), 'utf8')

const EXPECTED = ['--tevi-left-bar-glyph', '--tevi-left-bar-tile']

describe('left bar tile theming', () => {
    const written = [...read('left-bar.tsx').matchAll(/'(--tevi-[a-z-]+)':/g)].map(m => m[1]).sort()
    const readBack = [...read('list.tsx').matchAll(/var\((--tevi-[a-z-]+),/g)].map(m => m[1]).sort()

    it('writes exactly the custom properties the tile reads', () => {
        expect(written).toEqual(readBack)
    })

    it('uses the design system’s own property names', () => {
        expect(written).toEqual(EXPECTED)
    })
})
