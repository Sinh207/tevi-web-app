import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { collectSprite, spriteModule } from '../../../scripts/build-icon-sprite.mjs'

/**
 * `public/tevi-icons.<hash>.svg` and `sprite.ts` are generated but committed, so
 * a clone can typecheck without running the build. That trade means they can go
 * stale — someone adds an `<Icon name="…">` and forgets `pnpm icons`, and the
 * glyph is simply absent in production. These tests regenerate in memory and
 * fail on any drift.
 */
const root = process.cwd()

describe('shipped icon sprite', () => {
    const built = collectSprite() as {
        svg: string
        hash: string
        picked: string[]
        fileName: string
    }

    it('matches the committed sprite.ts', () => {
        const committed = readFileSync(join(root, 'src/shared/ui/sprite.ts'), 'utf8')
        expect(committed).toBe(spriteModule(built.fileName))
    })

    it('matches the committed hashed svg byte for byte', () => {
        const committed = readFileSync(join(root, 'public', built.fileName), 'utf8')
        expect(committed).toBe(built.svg)
    })

    it('carries every glyph the source references, and nothing near the full set', () => {
        expect(built.picked.length).toBeGreaterThan(0)
        /**
         * The full sprite is 27 702 symbols; anything in the thousands means the scan is
         * over-matching again (it did once, on `icon-names.ts` itself, which names every glyph there is).
         *
         * Raised from 200 to 400 when the channel feature landed: the subset legitimately grew past
         * 200 (the thirteen social brand marks, the alert statuses, the state glyphs). This is a
         * **regression guard, not a budget** — a real over-match lands in the high hundreds or at
         * 1579, so 400 still catches it with room for the app to keep growing. Do not let it drift
         * up one icon at a time; if it is ever close again, check the scanner before the number.
         *
         * Raised from 400 to 500 by the full-library import (554 → 4626 glyphs), which took the
         * subset from 392 to 448 without a single new `<Icon>`: pass 2 keeps any quoted token that
         * is a glyph name, and `'link'`, `'text'`, `'password'`, `'radio'`, `'lock'` all became
         * glyph names. ~56 KB raw, the known price of that pass — not a scanner fault.
         */
        expect(built.picked.length).toBeLessThan(500)
    })

    it('keeps a bare fallback for every weighted glyph', () => {
        const bare = new Set(built.picked.filter(id => !id.includes('--')))
        const orphans = built.picked
            .filter(id => id.includes('--'))
            .filter(id => !bare.has(id.split('--')[0]))
        expect(orphans).toEqual([])
    })

    it('has no dangling internal reference', () => {
        // Bare symbols are aliases onto a weighted one. Ship the alias without
        // its target and the <svg> renders nothing at all — silently.
        const have = new Set(
            [...built.svg.matchAll(/<symbol id="([^"]+)"/g)].map((m: RegExpMatchArray) => m[1]),
        )
        const refs = [...built.svg.matchAll(/<use[^>]+href="#([^"]+)"/g)].map(
            (m: RegExpMatchArray) => m[1],
        )
        expect(refs.filter(id => !have.has(id))).toEqual([])
    })
})
