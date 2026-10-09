/**
 * Builds the shipped icon sprite from `design-system/tevi-icons.svg`.
 *
 * The full design-system sprite is 60 MB (9 MB gzipped) across 27 702 symbols.
 * A screen uses ~20 glyphs, so shipping all of them costs ~7.7s before any icon
 * paints on a 400kbps connection. This script keeps only the glyphs the source
 * actually references and writes them to a content-hashed file, which
 * `next.config.ts` then serves `immutable`.
 *
 * Two passes over `src/`, because either alone misses real usage:
 *   1. every `<Icon …/>` tag — pairs `name` with the `weight` on the same tag,
 *      so a glyph is not pulled in at every weight it happens to have;
 *   2. any standalone quoted token that matches a glyph name — covers arrays,
 *      maps and props that feed a dynamic `name={…}`. Over-inclusive by design;
 *      a stray match costs ~1 KB.
 * Anything neither pass can see (a name built by string concatenation) belongs
 * in KEEP below.
 *
 *   node scripts/build-icon-sprite.mjs
 *
 * Outputs (both committed, both regenerated here — `pnpm test` fails if stale):
 *   public/tevi-icons.<hash>.svg
 *   src/shared/ui/sprite.ts
 */
import { createHash } from 'node:crypto'
import { readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

/** Glyphs no static scan can find. Add the reason when you add a name. */
const KEEP = [
    // `shared/ui/alert.tsx` picks its status glyph from a `Record<AlertStatus, …>` and renders it
    // as `<Icon name={STATUS_ICON[status]} weight="filled" />`. The name is computed, so pass 1
    // cannot pair it with the weight and pass 2 keeps only the bare id — which is why
    // `xmark-circle--filled` was missing and **every `Alert status="error"` in the app rendered
    // with no icon at all.** The DS gives the alert one surface for all five statuses, so that
    // glyph is the *only* thing marking it as an error; losing it is losing the state.
    //
    // The other three happen to be in the subset because unrelated files use them as literal
    // name+weight pairs — i.e. by luck, and one refactor away from the same failure. Listed here
    // so the alert owns its own glyphs.
    'info-circle--filled',
    'check-circle--filled',
    'exclamation-triangle--filled',
    'xmark-circle--filled',
    // The 2FA screens (`features/auth/components/two-fa/*`, `two-step-verification-dialog.tsx`) pick
    // the step's glyph from a `MARKS` table and draw it `weight="filled"`. `envelope` and the old
    // `lock-simple` alias onto `--filled`, so the bare id was enough; `key` aliases onto `--regular`,
    // and without this every passcode step would draw an empty disc.
    'key--filled',
]

const SOURCE = 'design-system/tevi-icons.svg'
/**
 * Glyphs the Figma library does not carry, kept beside the export rather than inside it so a
 * re-export cannot drop them. Merged **after** SOURCE, so if Figma later ships one of these ids
 * the overlay copy is what wins — and `icon-names.test.ts` fails on the duplicate so nobody has to
 * notice on their own. See that file's header for what is allowed in it.
 */
const EXTRA = 'design-system/tevi-icons.extra.svg'
const SRC_DIR = 'src'
const OUT_DIR = 'public'

/**
 * Files that name glyphs without using them. `icon-names.ts` alone lists all
 * 4627 as string literals, so leaving it in makes pass 2 select the whole sprite.
 */
const EXCLUDE = [/[\\/]icon-names\.ts$/, /[\\/]sprite\.ts$/, /\.test\.tsx?$/]

function sourceFiles(dir) {
    return readdirSync(dir, { withFileTypes: true }).flatMap(e => {
        const path = join(dir, e.name)
        if (e.isDirectory()) return sourceFiles(path)
        if (!/\.tsx?$/.test(e.name)) return []
        return EXCLUDE.some(re => re.test(path)) ? [] : [path]
    })
}

/**
 * Duotone glyphs hard-code `opacity="0.4"` on their tint path and `currentColor` on the
 * detail paths. A `<use>` clone lives in a shadow tree, so **no stylesheet rule can reach
 * those paths** — but custom properties inherit straight through it. Rewriting both values
 * as `var(…, <original>)` gives hosts two knobs and changes nothing wherever they are
 * unset, so `/dev/icons` and every existing call site render byte-identically.
 *
 *   --tevi-icon-tint     opacity of the tint path      (default 0.4)
 *   --tevi-icon-detail   fill of the detail paths      (default currentColor)
 *
 * The Tab Bar is what needs them: Figma takes the tint to full strength there and repaints
 * the detail White as a knockout (see `shared/ui/tab-bar.tsx`). Outside the two duotone weights, only a handful of the 27 702 symbols
 * carry an opacity at all, so this touches almost nothing.
 *
 * `style` rather than a presentation attribute because inline styles unambiguously accept
 * `var()`, and the tint path carries `fill="currentColor"` too — the lookahead keeps the
 * detail rewrite off it, whatever order the attributes come in.
 */
function duotoneHooks(symbol) {
    if (!symbol.includes('opacity=')) return symbol
    return symbol
        .replace(/\sopacity="([\d.]+)"/g, ' style="opacity:var(--tevi-icon-tint,$1)"')
        .replace(
            /<path(?![^>]*--tevi-icon-tint)([^>]*?)\sfill="currentColor"/g,
            '<path$1 style="fill:var(--tevi-icon-detail,currentColor)"',
        )
}

/**
 * The thirteen social marks (`telegram-icon`, `facebook-icon`, `x-icon`, …) are self-contained
 * badges: a disc or rounded square with the logo **knocked out**, painted a literal `#71717A` that
 * the Figma importer does not turn into `currentColor` (it only maps the ink, `#09090B`). So
 * `color` cannot reach them, and the share sheet's `text-white` used to leave a grey badge sitting
 * inside its own brand disc.
 *
 * Same trick as `duotoneHooks`: the fill becomes `var(--tevi-icon-brand, #71717A)`, which renders
 * byte-identically wherever the property is unset (the channel's social links) and lets a host
 * paint the badge in the company's own colour, with the knockout showing whatever sits behind it.
 */
function brandHooks(id, symbol) {
    if (!/-icon--regular$/.test(id)) return symbol
    return symbol.replace(/\sfill="#71717A"/gi, ' style="fill:var(--tevi-icon-brand,#71717A)"')
}

export function collectSprite() {
    const sprite = readFileSync(SOURCE, 'utf8') + readFileSync(EXTRA, 'utf8')
    const symbols = new Map(
        [...sprite.matchAll(/<symbol id="([^"]+)"[\s\S]*?<\/symbol>/g)].map(m => [m[1], m[0]]),
    )
    const glyphNames = new Set([...symbols.keys()].filter(id => !id.includes('--')))

    const wanted = new Set(KEEP)
    for (const file of sourceFiles(SRC_DIR)) {
        const code = readFileSync(file, 'utf8')

        // pass 1 — any component tag pairing a literal `name` with a literal `weight`, props in
        // any order, multiline. Written for `<Icon>` and widened to every capitalised tag when a
        // **wrapper** appeared: `shared/components/bar-icon-button.tsx` takes `name`/`weight` and
        // forwards them to `Icon` as variables, so `<Icon>` in that file is invisible to this pass
        // and the literals live at the call sites as `<BarIconButton name="share" weight="filled">`.
        // Pass 2 then kept only `share`, leaving `<use href="#share--filled">` dangling and the
        // button empty — measured, not hypothetical.
        //
        // Safe to widen because the name is validated against the real glyph list below: a component
        // whose `name` prop is not a glyph is skipped, and one that coincidentally is costs the ~1 KB
        // this file already tolerates for a pass-2 stray. Cheaper than an allowlist of wrappers that
        // someone has to remember to extend.
        for (const tag of code.matchAll(/<[A-Z][A-Za-z0-9]*\b[^>]*\/?>/g)) {
            const name = tag[0].match(/\bname=["']([^"']+)["']/)?.[1]
            if (!name || !glyphNames.has(name)) continue
            const weight = tag[0].match(/\bweight=["']([^"']+)["']/)?.[1]
            wanted.add(weight ? `${name}--${weight}` : name)
        }

        // pass 2 — any quoted token that is exactly a glyph name
        for (const token of code.matchAll(/["']([a-z0-9]+(?:-[a-z0-9]+)*)["']/g)) {
            if (glyphNames.has(token[1])) wanted.add(token[1])
        }

        // pass 3 — `{ name: 'x', weight: 'y' }` object literals, either key order.
        // A table of icons fed to a `<Icon {...spec} />` is invisible to pass 1 (no
        // literal tag) and pass 2 would only keep the default weight, leaving
        // `<use href="#x--y">` dangling and the icon blank. The Left Bar's row table
        // is the first of these; expect more.
        for (const [, a, b] of code.matchAll(
            /\bname:\s*["']([a-z0-9-]+)["']\s*,\s*weight:\s*["']([a-z-]+)["']/g,
        )) {
            if (glyphNames.has(a)) wanted.add(`${a}--${b}`)
        }
        for (const [, b, a] of code.matchAll(
            /\bweight:\s*["']([a-z-]+)["']\s*,\s*name:\s*["']([a-z0-9-]+)["']/g,
        )) {
            if (glyphNames.has(a)) wanted.add(`${a}--${b}`)
        }
    }

    // A weighted id implies the bare one is a legal fallback; keep both.
    for (const id of [...wanted]) {
        const bare = id.split('--')[0]
        if (bare !== id) wanted.add(bare)
    }

    // Bare symbols are aliases — `<symbol id="angle-left"><use href="#angle-left--regular"/>`
    // — so copying one without its target ships a dangling reference that
    // renders nothing. Walk every internal `<use href="#…">` transitively.
    for (const id of wanted) {
        for (const ref of (symbols.get(id) ?? '').matchAll(/<use[^>]+href="#([^"]+)"/g)) {
            wanted.add(ref[1])
        }
    }

    const missing = [...wanted].filter(id => !symbols.has(id))
    if (missing.length) {
        throw new Error(`referenced glyphs missing from ${SOURCE}: ${missing.join(', ')}`)
    }

    const picked = [...wanted].sort()
    const body = picked.map(id => brandHooks(id, duotoneHooks(symbols.get(id)))).join('\n')
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" style="display:none">\n${body}\n</svg>\n`
    const hash = createHash('sha256').update(svg).digest('hex').slice(0, 8)

    return { svg, hash, picked, totalSymbols: symbols.size, fileName: `tevi-icons.${hash}.svg` }
}

export function spriteModule(fileName) {
    return `// Generated by scripts/build-icon-sprite.mjs — do not edit by hand.
// Content-hashed subset of design-system/tevi-icons.svg, served immutable.

export const SPRITE_URL = '/${fileName}'
`
}

function main() {
    const { svg, picked, totalSymbols, fileName } = collectSprite()

    for (const stale of readdirSync(OUT_DIR)) {
        if (/^tevi-icons\.[a-f0-9]+\.svg$/.test(stale) && stale !== fileName) {
            rmSync(join(OUT_DIR, stale))
        }
    }

    writeFileSync(join(OUT_DIR, fileName), svg)
    writeFileSync('src/shared/ui/sprite.ts', spriteModule(fileName))

    const kb = n => `${(n / 1024).toFixed(1)} KB`
    console.log(
        `wrote ${OUT_DIR}/${fileName} — ${picked.length} of ${totalSymbols} symbols, ` +
            `${kb(svg.length)} (source ${kb(statSync(SOURCE).size)})`,
    )
}

if (process.argv[1]?.endsWith('build-icon-sprite.mjs')) main()
