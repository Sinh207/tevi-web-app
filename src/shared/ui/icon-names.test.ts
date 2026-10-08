import { readFileSync } from 'node:fs'
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
/**
 * Glyphs the Figma library does not carry, kept out of the export so a re-export cannot drop
 * them. `pnpm icons` merges the two, so the types are generated from both and so are these
 * assertions. See `design-system/tevi-icons.extra.svg` for what is allowed in it.
 */
const extra = readFileSync(join(root, 'design-system/tevi-icons.extra.svg'), 'utf8')
const generated = readFileSync(join(root, 'src/shared/ui/icon-names.ts'), 'utf8')

const idsIn = (svg: string) => [...svg.matchAll(/<symbol id="([^"]+)"/g)].map(m => m[1])
const figmaIds = idsIn(figma)
const extraIds = idsIn(extra)
const symbolIds = new Set([...figmaIds, ...extraIds])

/** Pull the `| 'name'` members out of one exported type alias. */
function unionMembers(typeName: string): string[] {
    const start = generated.indexOf(`export type ${typeName} =`)
    expect(start, `${typeName} is missing from icon-names.ts`).toBeGreaterThan(-1)
    const next = generated.indexOf('export type ', start + 1)
    const block = generated.slice(start, next === -1 ? undefined : next)
    return [...block.matchAll(/\|\s*'([^']+)'/g)].map(m => m[1])
}

const WEIGHTS = [
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

    it('keeps the 4626 glyphs of the Figma library, plus the overlay', () => {
        // The 2026-10-08 export (scripts/import-figma-icons.mjs) — the whole `↳ Icons` page, where
        // the first export carried 554. A truncated sprite fails here before it fails on a screen.
        const overlayNames = extraIds.filter(id => !id.includes('--'))
        expect(unionMembers('TeviIconName')).toHaveLength(4626 + overlayNames.length)
    })

    it('carries eye-slash, which the password reveal toggle needs', () => {
        // Two states, two glyphs. `eye`'s bare id is an alias onto `eye--filled`, so a weight
        // toggle draws it twice. The overlay supplied `eye-slash` until Figma shipped it, and the
        // import keeps its alias on `--filled` so the pair still matches.
        expect(symbolIds).toContain('eye-slash--filled')
        expect(figma).toContain('<symbol id="eye-slash" viewBox="0 0 24 24" fill="none"><use href="#eye-slash--filled">')
    })
})

/**
 * The overlay is a stopgap, and the failure mode of a stopgap is that it outlives its reason.
 * The day Figma ships one of these glyphs, the export and the overlay both define the id and
 * the merge silently picks one — which is exactly the kind of "renders something, just not the
 * right something" this whole area keeps producing. Fail instead, and the fix is to delete the
 * overlay entry.
 */
describe('upstream glyph overlay', () => {
    it('defines nothing the Figma export already has', () => {
        const inFigma = new Set(figmaIds)
        expect(extraIds.filter(id => inFigma.has(id))).toEqual([])
    })

    it('keeps every alias in it resolvable', () => {
        const have = new Set([...figmaIds, ...extraIds])
        const refs = [...extra.matchAll(/<use[^>]+href="#([^"]+)"/g)].map(m => m[1])
        expect(refs.filter(id => !have.has(id))).toEqual([])
    })
})
