/**
 * Rebuilds `design-system/tevi-icons.svg` from a dump of the Figma icon library.
 *
 * The library is the `↳ Icons` page of `Tevi Design system - Mobile` (WVfz0MwBGyGt67LfNEY2pW):
 * one COMPONENT_SET per glyph with a `Style` variant (Light / Regular / Filled / Duotone /
 * Duotone Line), plus 13 loose brand-mark components. The dump is what the figma-console Desktop
 * Bridge produces with `exportAsync({ format: 'SVG_STRING' })` on every variant — see
 * docs/DESIGN_SYSTEM.md §8 for the exact snippet — saved as `part-*.json` files of
 * `{ sid, set, id, v, svg }` rows, in page order.
 *
 *   node scripts/import-figma-icons.mjs <dump-dir>
 *   pnpm icons
 *
 * What it decides, and why each rule is here rather than in Figma:
 *
 *   - **Names.** `Globe Icon` → `globe-icon`, `NSFW` → `nsfw`, `signal-2g+` → `signal-2g-plus`,
 *     `aspect-ratio-1:1` → `aspect-ratio-1-1`. An id is a URL fragment and a TS literal.
 *   - **Duplicate names.** The library carries ~70 names used by two (one: three) *different*
 *     drawings. The first in page order keeps the bare name and later ones get `-1`, `-2` — except
 *     where an earlier export already settled it the other way (`DUPLICATE_BARE`), because changing
 *     that would silently redraw every existing call site.
 *   - **Ink.** Figma paints the ink `#09090B` (and NSFW its brand pink); both become `currentColor`
 *     so `className="text-…"` colours the glyph. White knockouts, `black` and gradients are left.
 *   - **Ids.** Every internal id (clipPath, gradient…) is prefixed with the symbol id — Figma's
 *     `clip0_27_47257` is unique per file, not per sprite, and a collision draws one glyph clipped
 *     by another's mask.
 *   - **The bare alias.** `<symbol id="x"><use href="#x--regular"/></symbol>`. Regular when it
 *     exists; but a glyph the previous sprite (or the overlay) already aliased elsewhere keeps that
 *     target — `eye` is `--filled` at every call site that writes `<Icon name="eye">`, and Figma
 *     adding a regular weight must not redraw them.
 *   - **`KEEP_PREVIOUS`.** Glyphs whose current symbols are carried over instead of re-exported.
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const OUT = 'design-system/tevi-icons.svg'
const OVERLAY = 'design-system/tevi-icons.extra.svg'

const WEIGHTS = {
    'Style=Light': 'light',
    'Style=Regular': 'regular',
    'Style=Filled': 'filled',
    'Style=Duotone': 'duotone',
    'Style=Duotone Line': 'duotone-line',
}
const DEFAULT_ORDER = ['regular', 'filled', 'light', 'duotone', 'duotone-line']

/**
 * Names where an earlier export gave the bare id to the Nth drawing (0-based, page order) rather
 * than the first. Kept so `search-unlock` and `check-line-square` mean what they meant.
 */
const DUPLICATE_BARE = {
    'bookmark-simple': 1,
    'check-line-square': 1,
    'location-pin-line': 1,
    page: 1,
    'search-unlock': 1,
}

/**
 * `premium` — Figma's current `Premium` is a 2.5 MB symbol around an embedded PNG, filters and a
 * pattern. The sprite subset is selected by scanning source for quoted glyph names, and `'premium'`
 * is an order kind in `features/payment` — so importing it would ship 2.5 MB to every page. The
 * previous 18×18 vector badge stays until Brand ships a vector.
 */
const KEEP_PREVIOUS = ['premium']

function normaliseName(name) {
    return name
        .trim()
        .toLowerCase()
        .replace(/\+/g, '-plus')
        .replace(/[\s:]+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
}

function symbolsOf(svg) {
    return new Map([...svg.matchAll(/<symbol id="([^"]+)"[\s\S]*?<\/symbol>/g)].map(m => [m[1], m[0]]))
}

function aliasTargets(symbols) {
    const out = new Map()
    for (const [id, s] of symbols) {
        if (id.includes('--')) continue
        const target = s.match(/<use[^>]+href="#[^"]+--([a-z-]+)"/)?.[1]
        if (target) out.set(id, target)
    }
    return out
}

function toSymbol(id, svg) {
    const viewBox = svg.match(/viewBox="([^"]+)"/)?.[1]
    if (!viewBox) throw new Error(`${id}: export has no viewBox`)
    const inner = svg
        .replace(/^[\s\S]*?<svg[^>]*>/, '')
        .replace(/<\/svg>\s*$/, '')
        .replace(/\s*\n\s*/g, ' ')
        .trim()
        .replace(/(fill|stroke)="#(?:09090B|F43FCA)"/gi, '$1="currentColor"')
        .replace(/\bid="([^"]+)"/g, `id="${id}_$1"`)
        .replace(/url\(#([^)]+)\)/g, `url(#${id}_$1)`)
        .replace(/href="#([^"]+)"/g, `href="#${id}_$1"`)
    return `<symbol id="${id}" viewBox="${viewBox}" fill="none">${inner}</symbol>`
}

function main() {
    const dir = process.argv[2]
    if (!dir) throw new Error('usage: node scripts/import-figma-icons.mjs <dump-dir>')

    const rows = readdirSync(dir)
        .filter(f => /^part-.*\.json$/.test(f))
        .sort()
        .flatMap(f => JSON.parse(readFileSync(join(dir, f), 'utf8')))
    if (rows.length === 0) throw new Error(`no part-*.json rows in ${dir}`)
    const failed = rows.filter(r => typeof r.svg !== 'string' || r.svg.startsWith('ERR'))
    if (failed.length) throw new Error(`${failed.length} variants failed to export: ${failed[0].set}`)

    // name → [{ sid, weights: { regular: svg, … } }] in page order
    const groups = new Map()
    for (const r of rows) {
        const name = normaliseName(r.set)
        const weight = r.v === null ? 'regular' : WEIGHTS[r.v]
        if (!weight) throw new Error(`${r.set}: unknown variant ${r.v}`)
        if (!groups.has(name)) groups.set(name, new Map())
        const sets = groups.get(name)
        if (!sets.has(r.sid)) sets.set(r.sid, {})
        sets.get(r.sid)[weight] = r.svg
    }

    const glyphs = new Map()
    for (const [name, sets] of groups) {
        const drawings = [...sets.values()]
        const bare = DUPLICATE_BARE[name] ?? 0
        let n = 0
        drawings.forEach((weights, i) => {
            const id = i === bare ? name : `${name}-${++n}`
            if (groups.has(id) && id !== name) throw new Error(`${id}: suffix collides with a real glyph`)
            glyphs.set(id, weights)
        })
    }

    const previous = symbolsOf(readFileSync(OUT, 'utf8'))
    const overlay = symbolsOf(readFileSync(OVERLAY, 'utf8'))
    const previousAlias = new Map([...aliasTargets(previous), ...aliasTargets(overlay)])

    const out = []
    for (const id of [...glyphs.keys()].sort()) {
        if (KEEP_PREVIOUS.includes(id)) {
            const kept = [...previous].filter(([k]) => k === id || k.startsWith(`${id}--`))
            if (kept.length === 0) throw new Error(`${id}: in KEEP_PREVIOUS but not in ${OUT}`)
            for (const [, s] of kept.sort(([a], [b]) => a.localeCompare(b))) out.push(s)
            continue
        }
        const weights = glyphs.get(id)
        const available = DEFAULT_ORDER.filter(w => weights[w])
        for (const w of [...available].sort()) out.push(toSymbol(`${id}--${w}`, weights[w]))
        const wanted = previousAlias.get(id)
        const target = wanted && weights[wanted] ? wanted : available[0]
        const viewBox = weights[target].match(/viewBox="([^"]+)"/)[1]
        out.push(
            `<symbol id="${id}" viewBox="${viewBox}" fill="none"><use href="#${id}--${target}"></use></symbol>`,
        )
    }

    writeFileSync(
        OUT,
        `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" style="display:none">\n\n${out.join('\n')}\n</svg>\n`,
    )
    const ids = out.map(s => s.match(/<symbol id="([^"]+)"/)[1])
    console.log(
        `wrote ${OUT} — ${ids.filter(i => !i.includes('--')).length} glyphs / ${ids.length} symbols`,
    )
}

main()
