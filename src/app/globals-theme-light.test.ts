import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * `.theme-light` has to stay a complete Light layer, and nothing fails when it stops being one.
 *
 * The class exists so a surface that ships its own light art — onboarding is the only one today —
 * can opt the whole subtree out of the theme, not just the literals it wrote. What makes that
 * fragile is where a custom property is **substituted**: at its declaration, not at its use. So
 * `--input-bg: var(--zinc-50)` computes on `:root`, and re-stating `--zinc-50` lower down does
 * nothing to it. The first version of the class copied only what `.dark` overrides and looked
 * right in review: the tokens written as literals went Light, and the three inputs stayed black.
 *
 * The invariant is therefore transitive, and this test computes it rather than trusting a list:
 * a `:root` token is theme-dependent if `.dark` overrides it **or** its value reaches one that is,
 * and every theme-dependent token must be re-declared here with its `:root` value.
 */

const CSS = readFileSync(join(import.meta.dirname, 'globals.css'), 'utf8')

/** `selector { … }` → the declarations inside, in source order. Values may span lines. */
function declarations(css: string, selector: string): [string, string][] {
    const out: [string, string][] = []
    // Rules are top-level and closed by a `}` in the first column, which is what bounds the scan.
    for (const block of css.matchAll(/^([^\n{}]*\{)\n([\s\S]*?)^\}$/gm)) {
        if (!block[1].includes(selector)) continue
        for (const d of block[2].matchAll(/^ {4}(--[a-z0-9-]+):\s*([^;]+);/gm)) {
            out.push([d[1], d[2].replace(/\s+/g, ' ').trim()])
        }
    }
    return out
}

const rootDecls = declarations(CSS, ':root {')
const root = new Map(rootDecls) // last wins, as the cascade does
const dark = new Set(declarations(CSS, "[data-theme='dark']").map(([name]) => name))
const themeLight = new Map(declarations(CSS, '.theme-light {'))

/** Every `:root` token that a mode change can move, directly or through a `var()` chain. */
function themeDependent(): Set<string> {
    const seen = new Set(dark)
    for (;;) {
        let grew = false
        for (const [name, value] of root) {
            if (seen.has(name)) continue
            const refs = [...value.matchAll(/var\((--[a-z0-9-]+)/g)].map(m => m[1])
            if (refs.some(ref => seen.has(ref))) {
                seen.add(name)
                grew = true
            }
        }
        if (!grew) return seen
    }
}

describe('.theme-light', () => {
    it('parses the blocks it is asserting about', () => {
        expect(root.size).toBeGreaterThan(100)
        expect(dark.size).toBeGreaterThan(50)
        expect(themeLight.size).toBeGreaterThan(100)
        // The trap the class exists for: `--input-bg` is not in `.dark` and still inverts.
        expect(dark.has('--input-bg')).toBe(false)
        expect(themeDependent().has('--input-bg')).toBe(true)
    })

    it('re-declares every token a mode change can move', () => {
        const missing = [...themeDependent()].filter(
            name => root.has(name) && !themeLight.has(name),
        )
        expect(missing).toEqual([])
    })

    it('re-declares them at their `:root` value', () => {
        const wrong = [...themeLight]
            .filter(([name, value]) => root.has(name) && root.get(name) !== value)
            .map(([name, value]) => `${name}: ${value} (root: ${root.get(name)})`)
        expect(wrong).toEqual([])
    })

    it('is declared after the dark blocks, so it wins on <html>', () => {
        // Both are one class, so specificity ties and source order is the whole mechanism —
        // `create-channel-gate.tsx` puts the class on the documentElement so portals inherit it.
        expect(CSS.indexOf('.theme-light {')).toBeGreaterThan(
            CSS.lastIndexOf(".dark,\n:root[data-theme='dark'] {"),
        )
    })

    it('carries `color-scheme`, which the tokens cannot reach', () => {
        // next-themes writes `color-scheme` as an inline style on <html>; a class there loses to it,
        // which is why the subtree copy on `<main>` is not redundant.
        expect(CSS.slice(CSS.indexOf('.theme-light {'))).toMatch(
            /^\.theme-light \{\n {4}color-scheme: light;/,
        )
    })
})
