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
/** The Figma export is the **only** source — what `/dev/icons` shows. */
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

    it('keeps exactly the 554 glyphs the design system documents', () => {
        expect(unionMembers('TeviIconName')).toHaveLength(554)
    })
})

/**
 * **Icons come only from the library** — the glyphs `/dev/icons` shows, which is
 * `design-system/tevi-icons.svg` and nothing else. An overlay of upstream Zappicon glyphs
 * (`tevi-icons.extra.svg`) used to be merged into both the sprite and these types; it was removed
 * so that `<Icon name>` itself refuses a glyph design never put in the library. A missing glyph is
 * a request to Brand, stood in for from this set until it lands — not a file beside the export.
 */
describe('the icon set is the library, and only the library', () => {
    it('has no overlay beside the Figma export', () => {
        expect(existsSync(join(root, 'design-system/tevi-icons.extra.svg'))).toBe(false)
    })

    it('generates nothing the export does not define', () => {
        const inFigma = new Set(figmaIds)
        expect(unionMembers('TeviIconName').filter(name => !inFigma.has(name))).toEqual([])
    })
})
