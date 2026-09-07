/**
 * Build the list of `data-testid`s in the app, so QC can find them without reading React.
 *
 * ```
 * pnpm testids            # regenerate testids/ (commit the result)
 * pnpm testids --check    # fail if the committed list drifted from src/
 * ```
 *
 * Generated but **committed**, for the same reason `src/shared/ui/icon-names.ts` is: it is read out
 * of git by people with no Node toolchain. `--check` is what stops the committed copy going stale.
 *
 * Two things it publishes that are not just a grep:
 *
 * - **Routes per scope, derived.** A testid's scope names a feature; the routes it appears on are
 *   computed by walking the import graph out of every `page.tsx`. A hand-maintained route list would
 *   be wrong within a sprint, and this one is recomputed on every run.
 * - **Derivations.** `<TextField data-testid="auth-email" />` produces nine elements and only one of
 *   them appears in that file — the other eight come from `subTestId` inside `field.tsx`. Without
 *   this table, finding a field's error line would mean reading React.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, normalize, relative } from 'node:path'
import { lineOf, parseSurfaces, stripComments } from './lib/testids.mjs'

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '')
const OUT = join(ROOT, 'testids')
const args = process.argv.slice(2)
const CHECK = args.includes('--check')

// ---------------------------------------------------------------------------------------------
// Source walking
// ---------------------------------------------------------------------------------------------

function walk(dir, test, out = []) {
    if (!existsSync(dir)) return out
    for (const name of readdirSync(dir)) {
        const path = join(dir, name)
        if (statSync(path).isDirectory()) {
            if (name === 'node_modules' || name === '.next') continue
            walk(path, test, out)
        } else if (test(path)) out.push(path)
    }
    return out
}

const isSource = path =>
    /\.tsx?$/.test(path) &&
    !/\.(test|spec)\.tsx?$/.test(path) &&
    !path.includes('/app/(web)/dev/')

const rel = path => relative(ROOT, path)

// ---------------------------------------------------------------------------------------------
// Extraction — independent of the guard test's own regex, on purpose (see icon-names.test.ts)
// ---------------------------------------------------------------------------------------------

/** Literal `data-testid="…"`, plus any literal `testId="…"` prop (config files use the prop form). */
function literalsIn(src) {
    const found = []
    for (const match of src.matchAll(/(?:data-testid|testId)="([^"]+)"/g)) {
        found.push({ id: match[1], index: match.index })
    }
    for (const match of src.matchAll(/\btestId:\s*'([^']+)'/g)) {
        found.push({ id: match[1], index: match.index })
    }
    return found
}

/** Companion attributes written on the same JSX element as a `data-testid`. */
function companionsNear(src, index) {
    // The element's own attribute run: back to the opening `<`, forward to the closing `>`.
    const open = src.lastIndexOf('<', index)
    const close = src.indexOf('>', index)
    if (open === -1 || close === -1) return []
    const element = src.slice(open, close)
    return [
        ...new Set(
            [...element.matchAll(/(data-[a-z][a-z-]*(?:-id|-key|-code|-value|-slug|-index))=/g)].map(
                m => m[1],
            ),
        ),
    ]
}

/** The `TestIdPart`s a file derives, and the identifier it derives them from. */
function derivationsIn(src) {
    return [...new Set([...src.matchAll(/subTestId\([^,]+,\s*'([^']+)'\)/g)].map(m => m[1]))].sort()
}

/**
 * Components in a file that accept a testid.
 *
 * Four spellings, because there are four: a `testId` prop, a destructured `'data-testid':`, a
 * `& TestIdProps` intersection, and `props['data-testid']` — which is how `DialogContent` reads it.
 *
 * The window is scanned **after** each `export function Name(` rather than by matching the whole
 * signature: requiring the signature to match meant a component whose inline type annotation ran
 * past the window was dropped entirely, which is how `GetAppDialog` disappeared from this table
 * while `StoreButtons` beside it stayed.
 */
function acceptorsIn(src) {
    const names = []
    for (const match of src.matchAll(/export function ([A-Z][A-Za-z0-9]*)\(/g)) {
        const window = src.slice(match.index, match.index + 1200)
        if (/\btestId\b|'data-testid':|TestIdProps|props\['data-testid'\]/.test(window)) {
            names.push(match[1])
        }
    }
    return names
}

// ---------------------------------------------------------------------------------------------
// Route attribution
// ---------------------------------------------------------------------------------------------

/** Every route a `page.tsx` serves, keyed by the file that serves it. */
function routeFiles() {
    const out = new Map()
    for (const [base, prefix] of [
        [join(ROOT, 'src/app/(web)'), ''],
        [join(ROOT, 'src/app/app'), '/app'],
    ]) {
        for (const file of walk(base, path => path.endsWith('/page.tsx'))) {
            if (file.includes('/dev/')) continue
            const segments = dirname(file)
                .slice(base.length)
                .split('/')
                .filter(s => s && !(s.startsWith('(') && s.endsWith(')')))
            out.set(file, `${prefix}/${segments.join('/')}`.replace(/\/+$/, '') || '/')
        }
    }
    return out
}

/**
 * Which scopes a route pulls in, by following `@features/*` barrels and relative imports.
 *
 * Relative imports are followed because a page is usually three lines that render one `screen.tsx`,
 * and stopping at the page would attribute almost nothing.
 */
function scopesReachedBy(file, seen = new Set()) {
    const found = new Set()
    if (seen.has(file) || !existsSync(file)) return found
    seen.add(file)
    const src = readFileSync(file, 'utf8')
    for (const match of src.matchAll(/from '(@features\/([a-z-]+)[^']*|\.\.?\/[^']+)'/g)) {
        if (match[2]) {
            found.add(match[2])
            continue
        }
        const candidate = normalize(join(dirname(file), match[1]))
        for (const extension of ['.tsx', '.ts', '/index.tsx', '/index.ts']) {
            if (existsSync(candidate + extension)) {
                for (const scope of scopesReachedBy(candidate + extension, seen)) found.add(scope)
                break
            }
        }
    }
    return found
}

function routesByScope() {
    const byScope = new Map()
    for (const [file, route] of routeFiles()) {
        for (const scope of scopesReachedBy(file)) {
            if (!byScope.has(scope)) byScope.set(scope, new Set())
            byScope.get(scope).add(route)
        }
        // A page's own directory segments are scopes too — a webview screen with no feature barrel.
        for (const segment of route.split('/')) {
            if (!/^[a-z][a-z0-9-]*$/.test(segment)) continue
            if (!byScope.has(segment)) byScope.set(segment, new Set())
            byScope.get(segment).add(route)
        }
    }
    return byScope
}

// ---------------------------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------------------------

const surfaces = () =>
    parseSurfaces(readFileSync(join(ROOT, 'src/shared/lib/testid-surfaces.ts'), 'utf8'))

function build() {
    const SURFACES = surfaces()
    const ROUTES = routesByScope()
    const ids = {}
    const derivations = {}

    for (const file of walk(join(ROOT, 'src'), isSource)) {
        // Comments stripped first, or the worked examples in this repo's doc comments end up in the
        // generated list — `confirm-dialog.tsx`'s JSDoc put `channel-unpublish` in it.
        const src = stripComments(readFileSync(file, 'utf8'))
        const path = rel(file)

        for (const { id, index } of literalsIn(src)) {
            const scope = Object.keys(SURFACES).find(
                name => id === name || id.startsWith(`${name}-`),
            )
            const companions = companionsNear(src, index)
            ids[id] = {
                scope: scope ?? null,
                routes: scope ? [...(ROUTES.get(scope) ?? [])].sort() : [],
                ...(companions.length ? { companions } : {}),
                source: `${path}:${lineOf(src, index)}`,
            }
        }

        /*
         * Anywhere, not just `src/shared/` — which is where this looked first, and it silently
         * omitted `features/auth`'s `PasswordField`, whose `-reveal` and `-caps` are exactly the
         * sub-parts a sign-in test needs. A derivation is a derivation wherever it lives.
         */
        const parts = derivationsIn(src)
        const acceptors = acceptorsIn(src)
        if (parts.length && acceptors.length) {
            derivations[path] = { accepts: acceptors, parts }
        }
    }

    return {
        $generatedBy: 'scripts/build-testid-catalog.mjs — run `pnpm testids`, do not edit by hand',
        $contract: 'docs/TEST_IDS.md',
        counts: { ids: Object.keys(ids).length, surfaces: Object.keys(SURFACES).length },
        surfaces: Object.fromEntries(
            Object.entries(SURFACES)
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([name, surface]) => [
                    name,
                    { ...surface, routes: [...(ROUTES.get(name) ?? [])].sort() },
                ]),
        ),
        ids: Object.fromEntries(Object.entries(ids).sort(([a], [b]) => a.localeCompare(b))),
        derivations: Object.fromEntries(
            Object.entries(derivations).sort(([a], [b]) => a.localeCompare(b)),
        ),
    }
}

// ---------------------------------------------------------------------------------------------
// Emit
// ---------------------------------------------------------------------------------------------

function markdown(catalog) {
    const out = [
        '<!-- Generated by scripts/build-testid-catalog.mjs — run `pnpm testids`. Do not edit. -->',
        '',
        '# Test id catalog',
        '',
        'The contract, the Selenium idioms and the trap list are in [`../docs/TEST_IDS.md`](../docs/TEST_IDS.md).',
        'Locate **only** by these values plus the state attributes each row names — never by class,',
        'visible text (nine locales), or DOM position.',
        '',
        `${catalog.counts.ids} ids across ${catalog.counts.surfaces} surfaces.`,
        '',
    ]

    for (const [name, surface] of Object.entries(catalog.surfaces)) {
        const rows = Object.entries(catalog.ids).filter(([, entry]) => entry.scope === name)
        out.push(`## \`${name}\` — ${surface.label}`, '')
        // Both lines when both apply: a surface can own screens *and* put something on every
        // route — `auth` owns /login and the global splash. Printing only one would understate it.
        if (surface.routes.length) {
            out.push(`Routes: ${surface.routes.map(r => `\`${r}\``).join(', ')}`, '')
        }
        if (surface.mountedBy) {
            out.push(
                `Also present on every route it is mounted under — \`${surface.mountedBy}\`.`,
                '',
            )
        }
        if (!surface.routes.length && !surface.mountedBy) out.push('_Not attributed._', '')
        if (!rows.length) {
            out.push('_No ids yet._', '')
            continue
        }
        out.push('| testid | companions | source |', '|---|---|---|')
        for (const [id, entry] of rows) {
            out.push(
                `| \`${id}\` | ${
                    entry.companions?.map(c => `\`${c}\``).join(', ') ?? '—'
                } | \`${entry.source}\` |`,
            )
        }
        out.push('')
    }

    out.push(
        '## Derived sub-parts',
        '',
        'A `testId` handed to one of these renders more than one element. The parts derive onto the',
        'end of the id you passed — so `data-testid="auth-email"` on a `TextField` also gives you',
        '`auth-email-error`, `auth-email-label`, and the rest. You do not need this table to guess a',
        'name; you need it to know the element exists.',
        '',
        '| component(s) | file | parts |',
        '|---|---|---|',
    )
    for (const [file, entry] of Object.entries(catalog.derivations)) {
        out.push(
            `| ${entry.accepts.map(n => `\`${n}\``).join(', ')} | \`${file}\` | ${entry.parts
                .map(p => `\`-${p}\``)
                .join(' ')} |`,
        )
    }
    out.push('')
    return out.join('\n')
}





// ---------------------------------------------------------------------------------------------

function main() {
    mkdirSync(OUT, { recursive: true })
    const catalog = build()

    const files = {
        'catalog.json': `${JSON.stringify(catalog, null, 4)}\n`,
        'CATALOG.md': markdown(catalog),
    }

    if (CHECK) {
        const stale = Object.entries(files).filter(([name, content]) => {
            const path = join(OUT, name)
            return !existsSync(path) || readFileSync(path, 'utf8') !== content
        })
        if (stale.length) {
            console.log(
                `testids/ is stale — ${stale.map(([name]) => name).join(', ')} ` +
                    'differ from what src/ produces.\n\n' +
                    'Run `pnpm testids` and commit testids/. The catalog is generated but committed\n' +
                    'for the same reason src/shared/ui/icon-names.ts is: QC reads it out of git, with\n' +
                    'no Node toolchain, so it has to be a file in the tree and not a build step.',
            )
            process.exitCode = 1
            return
        }
        console.log(`OK — testids/ matches src/ (${catalog.counts.ids} ids).`)
        return
    }

    for (const [name, content] of Object.entries(files)) {
        writeFileSync(join(OUT, name), content)
    }
    console.log(`Wrote testids/ — ${catalog.counts.ids} ids, ${catalog.counts.surfaces} surfaces.`)
}

main()
