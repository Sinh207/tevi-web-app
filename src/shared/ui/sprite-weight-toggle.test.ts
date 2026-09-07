import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * A weight toggle on an aliased glyph draws the same thing twice.
 *
 * 65 of the sprite's bare ids are not drawings — they are `<use>` aliases onto one weighted
 * symbol, and where that target is `--filled`, the glyph has exactly one rendering. `eye` is
 * one of those (`icons.md`: `eye *(filled only)*`), so the password field's
 * `weight={revealed ? 'filled' : undefined}` toggled between `#eye` and `#eye--filled` —
 * the same paths — and the reveal button looked broken for months. Nothing errored: both
 * ids resolve, both render, they are simply identical.
 *
 * `sprite.test.ts` guards the other half of this (an alias shipped without its target
 * renders nothing). This guards the half that renders *something*, just never a second
 * state.
 */
const SRC = join(process.cwd(), 'src')
const SPRITE = join(process.cwd(), 'design-system/tevi-icons.svg')

/** Bare id → the weighted symbol it is an alias for, for every alias in the sprite. */
function aliasTargets() {
    const svg = readFileSync(SPRITE, 'utf8')
    const targets = new Map<string, string>()
    for (const [, id, ref] of svg.matchAll(
        /<symbol id="([^"]+)"[^>]*>\s*<use href="#([^"]+)"><\/use>\s*<\/symbol>/g,
    )) {
        targets.set(id, ref)
    }
    return targets
}

/**
 * Comments are prose, and prose about this bug quotes the broken call verbatim — the note in
 * `auth-fields.tsx` explaining why the weight toggle was wrong tripped this test on its own
 * first run. Strip block and line comments before matching; a guard that fails on its own
 * documentation teaches people to delete the documentation.
 */
function stripComments(code: string) {
    return code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/[^\n]*/g, '$1')
}

function sourceFiles(dir: string): string[] {
    return readdirSync(dir).flatMap(entry => {
        const path = join(dir, entry)
        if (statSync(path).isDirectory()) return sourceFiles(path)
        return /\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry) ? [path] : []
    })
}

describe('icon weight toggles', () => {
    it('never toggles a weight the glyph does not actually have', () => {
        const targets = aliasTargets()
        const offenders: string[] = []

        for (const file of sourceFiles(SRC)) {
            const code = stripComments(readFileSync(file, 'utf8'))
            // `name="x" … weight={<anything with a literal weight>}` — a *conditional*
            // weight, i.e. one the component means to change between two renders.
            for (const [, name, weight] of code.matchAll(
                /name="([a-z0-9-]+)"[^>]*?weight=\{[^}]*?'(filled|light|duotone|duotone-line)'/g,
            )) {
                if (targets.get(name) === `${name}--${weight}`) {
                    offenders.push(
                        `${file.slice(process.cwd().length + 1)}: #${name} is an alias of ` +
                            `#${name}--${weight}, so toggling that weight draws the same glyph twice`,
                    )
                }
            }
        }

        expect(offenders).toEqual([])
    })
})
