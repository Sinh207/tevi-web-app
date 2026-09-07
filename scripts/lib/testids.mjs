/**
 * The shared reading half of the `data-testid` tooling — used by `check-testids.mjs` (the grammar
 * linter) and `build-testid-catalog.mjs` (the catalog generator).
 *
 * Deliberately **not** used by `src/shared/lib/testid-catalog.test.ts`. That test re-derives the id
 * set with its own independent regex, the way `src/shared/ui/icon-names.test.ts` re-implements
 * `idsIn()` rather than importing the generator: two implementations agreeing is a real check, where
 * one implementation compared against its own output is not. (It also could not import this even if
 * it wanted to — `tsconfig.json`'s `include` covers `.ts`/`.tsx`/`.mts`, not `.mjs`.)
 *
 * Two things here exist because the naive version was wrong, and both were caught by reading the
 * generator's own output rather than by reasoning:
 *
 * 1. **Comments have to be stripped before extraction.** Every doc comment in this repo carries
 *    worked examples, so `testId="channel-unpublish"` inside a JSDoc block on `confirm-dialog.tsx`
 *    became an entry in the generated list.
 * 2. **A `Record` literal cannot be parsed with a regex.** `/^ {4}\w+: \{([\s\S]*?)^ {4}\},$/gm`
 *    starting on a single-line entry runs forward to the *next* entry's closing brace and swallows
 *    everything between — which is how `privacy-settings` silently vanished from a 24-surface file
 *    that reported 23. Brace balance, not patterns.
 */

/**
 * Blank out `//` and block comments, preserving byte offsets and newlines so `file:line` stays true.
 *
 * String literals are respected, so a `//` inside a URL or a `/*` inside a class string survives.
 */
export function stripComments(src) {
    let out = ''
    let i = 0
    while (i < src.length) {
        const two = src.slice(i, i + 2)
        if (two === '//') {
            const end = src.indexOf('\n', i)
            const stop = end === -1 ? src.length : end
            out += ' '.repeat(stop - i)
            i = stop
        } else if (two === '/*') {
            const end = src.indexOf('*/', i + 2)
            const stop = end === -1 ? src.length : end + 2
            out += src.slice(i, stop).replace(/[^\n]/g, ' ')
            i = stop
        } else if (src[i] === '"' || src[i] === "'" || src[i] === '`') {
            const quote = src[i]
            let j = i + 1
            while (j < src.length && src[j] !== quote) j += src[j] === '\\' ? 2 : 1
            out += src.slice(i, Math.min(j + 1, src.length))
            i = j + 1
        } else {
            out += src[i]
            i++
        }
    }
    return out
}

/** The body of the first `{ … }` after `marker`, by brace balance. */
function objectAfter(src, marker) {
    const start = src.indexOf(marker)
    if (start === -1) return ''
    const open = src.indexOf('{', start)
    if (open === -1) return ''
    let depth = 0
    for (let i = open; i < src.length; i++) {
        if (src[i] === '{') depth++
        else if (src[i] === '}') {
            depth--
            if (depth === 0) return src.slice(open + 1, i)
        }
    }
    return ''
}

/** Top-level `key: { … }` entries of an object literal body, by brace balance. */
function entriesOf(body) {
    const out = []
    let i = 0
    while (i < body.length) {
        const match = /(?:'([a-z][a-z0-9-]*)'|([a-z][a-z0-9-]*))\s*:\s*\{/.exec(body.slice(i))
        if (!match) break
        const name = match[1] ?? match[2]
        const open = i + match.index + match[0].length - 1
        let depth = 0
        let close = open
        for (let j = open; j < body.length; j++) {
            if (body[j] === '{') depth++
            else if (body[j] === '}') {
                depth--
                if (depth === 0) {
                    close = j
                    break
                }
            }
        }
        out.push([name, body.slice(open + 1, close)])
        i = close + 1
    }
    return out
}

/** `{ [scope]: { kind, label, mountedBy? } }` out of `src/shared/lib/testid-surfaces.ts`. */
export function parseSurfaces(source) {
    const src = stripComments(source)
    const body = objectAfter(src, 'export const TESTID_SURFACES')
    const out = {}
    for (const [name, entry] of entriesOf(body)) {
        const mountedBy = entry.match(/mountedBy:\s*'([^']+)'/)?.[1]
        out[name] = {
            kind: entry.match(/kind:\s*'([a-z]+)'/)?.[1] ?? 'screen',
            label: entry.match(/label:\s*'([^']+)'/)?.[1] ?? name,
            ...(mountedBy ? { mountedBy } : {}),
        }
    }
    return out
}

/** The `TestIdPart` union members, from `src/shared/lib/test-id.ts`. */
export function parseParts(source) {
    const src = stripComments(source)
    const start = src.indexOf('export type TestIdPart =')
    const end = src.indexOf('\n\n', start)
    return new Set([...src.slice(start, end).matchAll(/'([a-z-]+)'/g)].map(m => m[1]))
}

/** The approved companion attribute names, from `src/shared/lib/test-id.ts`. */
export function parseCompanions(source) {
    const src = stripComments(source)
    const start = src.indexOf('export const TESTID_COMPANIONS')
    const end = src.indexOf('] as const', start)
    return new Set([...src.slice(start, end).matchAll(/'(data-[a-z-]+)'/g)].map(m => m[1]))
}

/**
 * Every `data-testid=` and `testId=` in a file, as `{ index, literal?, expression? }`, comments gone.
 *
 * The expression form needs brace balance for the same reason as above: `\{([^}]*)\}` stops at the
 * `}` inside `${…}`, so the offending value came out truncated in the very message meant to show it.
 */
export function testIdAttributes(src) {
    const found = []
    // Both spellings: the DOM attribute, and the `testId` **prop** that the shared composites take.
    // Grading only the former left a hole — `<PickerList testId="…">` is just as much a published id,
    // and it skipped the grammar and scope checks entirely.
    for (const match of src.matchAll(/(?:data-testid|\btestId)=/g)) {
        const start = match.index + match[0].length
        if (src[start] === '"') {
            const end = src.indexOf('"', start + 1)
            if (end !== -1) found.push({ index: match.index, literal: src.slice(start + 1, end) })
            continue
        }
        if (src[start] !== '{') continue
        let depth = 0
        for (let i = start; i < src.length; i++) {
            if (src[i] === '{') depth++
            else if (src[i] === '}') {
                depth--
                if (depth === 0) {
                    found.push({ index: match.index, expression: src.slice(start + 1, i) })
                    break
                }
            }
        }
    }
    return found
}

export const lineOf = (src, index) => src.slice(0, index).split('\n').length
