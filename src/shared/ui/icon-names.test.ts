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
const sprite = readFileSync(join(root, 'design-system/tevi-icons.svg'), 'utf8')
const generated = readFileSync(join(root, 'src/shared/ui/icon-names.ts'), 'utf8')

const symbolIds = new Set([...sprite.matchAll(/<symbol id="([^"]+)"/g)].map(m => m[1]))

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

    it('keeps the 554 glyphs the design system documents', () => {
        expect(unionMembers('TeviIconName')).toHaveLength(554)
    })
})
