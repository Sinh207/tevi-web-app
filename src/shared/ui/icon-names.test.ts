import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * `icon-names.ts` is generated from the sprite and is types-only, so nothing at
 * runtime can drift-check it. These tests read both files as text instead: if
 * someone hand-edits the union, drops a glyph from the sprite, or forgets to
 * re-run `scripts/generate-icon-names.mjs`, one of them fails.
 */
const root = process.cwd()
const figma = readFileSync(join(root, 'design-system/tevi-icons.svg'), 'utf8')
const generated = readFileSync(join(root, 'src/shared/ui/icon-names.ts'), 'utf8')

const idsIn = (svg: string) => [...svg.matchAll(/<symbol id="([^"]+)"/g)].map(m => m[1])
const figmaIds = idsIn(figma)
const symbolIds = new Set(figmaIds)

/** Pull the `| 'name'` members out of one exported type alias. */
function unionMembers(typeName: string): string[] {
    const start = generated.indexOf(`export type ${typeName} =`)
    expect(start, `${typeName} is missing from icon-names.ts`).toBeGreaterThan(-1)
    const next = generated.indexOf('export type ', start + 1)
    const block = generated.slice(start, next === -1 ? undefined : next)
    return [...block.matchAll(/\|\s*'([^']+)'/g)].map(m => m[1])
}

const WEIGHTS = [
    ['TeviIconNameRegular', 'regular'],
    ['TeviIconNameFilled', 'filled'],
    ['TeviIconNameLight', 'light'],
    ['TeviIconNameDuotone', 'duotone'],
    ['TeviIconNameDuotoneLine', 'duotone-line'],
] as const

describe('tevi icon sprite', () => {
    it('exposes every bare glyph as TeviIconName', () => {
        const bare = [...symbolIds].filter(id => !id.includes('--')).sort()
        expect(unionMembers('TeviIconName')).toEqual(bare)
    })

    it('has no duplicate names', () => {
        const names = unionMembers('TeviIconName')
        expect(new Set(names).size).toBe(names.length)
    })

    for (const [typeName, weight] of WEIGHTS) {
        it(`lists exactly the glyphs drawn in the ${weight} weight`, () => {
            const expected = [...symbolIds]
                .filter(id => id.endsWith(`--${weight}`))
                .map(id => id.slice(0, -(weight.length + 2)))
                .sort()
            expect(unionMembers(typeName)).toEqual(expected)
        })
    }

    it('resolves every name+weight pair the types allow to a real symbol', () => {
        const missing: string[] = []
        for (const name of unionMembers('TeviIconName')) {
            if (!symbolIds.has(name)) missing.push(name)
        }
        for (const [typeName, weight] of WEIGHTS) {
            for (const name of unionMembers(typeName)) {
                if (!symbolIds.has(`${name}--${weight}`)) missing.push(`${name}--${weight}`)
            }
        }
        expect(missing).toEqual([])
    })

    it('keeps the 4626 glyphs of the Figma library', () => {
        // The 2026-10-08 export (scripts/import-figma-icons.mjs) — the whole `↳ Icons` page, where
        // the first export carried 554. A truncated sprite fails here before it fails on a screen.
        expect(unionMembers('TeviIconName')).toHaveLength(4626)
    })

    it('carries eye-slash, which the password reveal toggle needs', () => {
        // Two states, two glyphs. `eye`'s bare id is an alias onto `eye--filled`, so a weight
        // toggle draws it twice. The import keeps `eye-slash`'s alias on `--filled` so the pair
        // still matches.
        expect(symbolIds).toContain('eye-slash--filled')
        expect(figma).toContain('<symbol id="eye-slash" viewBox="0 0 24 24" fill="none"><use href="#eye-slash--filled">')
    })
})

/**
 * **Icons come only from the library `/dev/icons` shows** — the Figma export, and nothing beside
 * it. There used to be an overlay of upstream glyphs merged in by `pnpm icons`; it is gone, and a
 * second source coming back is the regression this pins. A missing glyph goes to Brand, not here.
 */
describe('one icon source', () => {
    it('has no overlay beside the Figma export', () => {
        expect(existsSync(join(root, 'design-system/tevi-icons.extra.svg'))).toBe(false)
    })

    it('generates names from the Figma export alone', () => {
        const script = readFileSync(join(root, 'scripts/generate-icon-names.mjs'), 'utf8')
        expect(script).not.toContain('extra')
    })
})
