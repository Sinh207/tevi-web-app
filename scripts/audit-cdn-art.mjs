/**
 * Fail if any static artwork is still fetched from the CDN.
 *
 * ```
 * pnpm art:audit          # exit 1 on any remote image URL in src/
 * pnpm art:audit --all    # also list the runtime-built URLs it cannot resolve
 * ```
 *
 * ## The rule
 *
 * **No static image in `src/` may point at another host.** Every illustration, banner, backdrop and
 * brand mark is committed under `public/illustrations/` and built by `scripts/build-cdn-art.mjs`.
 * That is stricter than the byte budgets this script used to enforce, and deliberately so — three
 * separate things kept slipping through a size check:
 *
 * 1. **`next/image` does not process a remote SVG**, it passes one through. `dangerouslyAllowSVG` in
 *    `next.config.ts` is permission to *serve*, not to optimise, and `width`/`height` on `<Image>`
 *    change nothing about the bytes. `logo-gyf.svg` was 2.27 MB to fill a 64px tile.
 * 2. **A CSS `background-image` is never optimised at all** — no AVIF, no responsive widths. Two of
 *    those sat unexamined for exactly that reason ("already the right size").
 * 3. **Small is not the same as local.** The last two CDN references in `features/membership` were
 *    3.0 and 3.2 KB: measured, under budget, reported as fine, and still a third party standing
 *    between a rendering screen and its picture — one that can change what it serves between a
 *    review and a deploy.
 *
 * So the check is now binary, and the network is only touched to say *how bad* a violation is.
 *
 * A URL this script cannot resolve is reported as `WARN` rather than failed: it is built at runtime,
 * which means it is content rather than artwork. There is exactly one — `socialMarkUrl()`, whose
 * platform list comes from the backend, so the set of files is open-ended and cannot be committed.
 * Anything else that turns up as a WARN needs a decision, not a shrug.
 *
 * ## The other direction
 *
 * It also lists **committed art nothing references**. Moving art into the repo turns a stale CDN
 * path into a stale *file*, and a file nobody draws is invisible in a way a broken URL is not: it
 * costs a clone and a deploy forever and no screen ever misses it. Reported, never failed — a
 * screen still being built has a legitimate reason to have its art land first.
 *
 * `docs/STATIC_ASSETS.md` is the runbook.
 */

import { readFile, readdir } from 'node:fs/promises'
import { basename, dirname, extname, join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SRC = join(ROOT, 'src')
const ART = join(ROOT, 'public/illustrations')

const IMAGE = new Set(['.png', '.jpg', '.jpeg', '.webp', '.avif', '.gif', '.svg'])

/** Files that describe CDN art without pointing the app at it. */
const IGNORE = /\.(test|spec)\.tsx?$/

/**
 * `src/app/(web)/dev/**` — the harnesses, skipped entirely.
 *
 * The rule above is about "a third party standing between **a rendering screen** and its picture".
 * A `/dev/*` page is not one: it calls `notFound()` in production — which `next build && next start`
 * sets, so staging too — and `proxy.ts` blocks the namespace besides. Same exemption
 * `check-testids.mjs` makes, for the same reason, and the same category the `IGNORE` regex above
 * already puts test files in.
 *
 * There is a second, stronger reason for the two references this unblocked, and it is specific to
 * what a fixture is *for*:
 *
 * - `dev/payout/fixtures.ts` stands in for `payout_method.logo_url`, a **backend-decided** URL and
 *   the sanctioned exception to the whole no-CDN rule (`docs/STATIC_ASSETS.md`). Committing a local
 *   copy would make the fixture *less* faithful: the real row loads a remote mark, so the harness
 *   should too.
 * - `dev/get-star/preview.tsx` previews a card-brand glyph the sprite does not have — the real row
 *   prints `Visa ···· 4242` as text (`docs/PAYMENT.md` §8). Committing brand art for a row that
 *   renders none would put a Visa logo in the repo on nobody's behalf.
 *
 * ⚠ **This is not a loophole for a real screen.** A path copied out of a fixture into
 * `src/features/**` is still caught there, which is where it would matter. If a `/dev/*` page ever
 * becomes reachable in production, this exemption has to go with it.
 */
const IGNORE_DIRS = [join('app', '(web)', 'dev')]

/**
 * Comments are stripped before scanning, and that is not tidiness — the `illustrations.ts` files
 * document the assets they *replaced*, so scanning the prose reports art nothing renders and buries
 * the lines that matter. Line comments are only cut when the `//` is not part of a `://`.
 */
function stripComments(text) {
    return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1')
}

function isIgnoredDir(path) {
    const rel = relative(SRC, path)
    return IGNORE_DIRS.some(dir => rel === dir || rel.startsWith(dir + sep))
}

async function sourceFiles(dir) {
    const out = []
    for (const entry of await readdir(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name)
        if (entry.isDirectory()) {
            if (isIgnoredDir(path)) continue
            out.push(...(await sourceFiles(path)))
        } else if (/\.tsx?$/.test(entry.name) && !IGNORE.test(entry.name)) {
            out.push(path)
        }
    }
    return out
}

async function artFiles(dir) {
    const out = []
    for (const entry of await readdir(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name)
        if (entry.isDirectory()) out.push(...(await artFiles(path)))
        else out.push(path)
    }
    return out
}

/**
 * Committed art no source file mentions. Matched on the **file name**, not the full path, because
 * several features build the path from a base (`checkout-status-dialog.tsx` has
 * `const ART_BASE = '/illustrations/payment'` and appends), and a full-path match reports five
 * false orphans on that one feature alone. A loose match is the right trade here: the question is
 * "does anything mention this file at all", and a false *negative* costs a stale file while a false
 * positive costs somebody an afternoon proving the tool wrong.
 */
async function orphans(sources) {
    const haystack = (await Promise.all(sources.map(f => readFile(f, 'utf8')))).join('\n')
    const found = []
    for (const file of await artFiles(ART)) {
        if (!haystack.includes(basename(file))) {
            found.push(`/illustrations/${relative(ART, file).split(sep).join('/')}`)
        }
    }
    return found
}

/**
 * Resolve `${STATIC_DOMAIN}/web/…` against the `const` bindings in the same file. Deliberately not a
 * parser: anything it cannot resolve is *reported*, never skipped — a silent skip is how an
 * unexamined asset would slip past.
 */
function resolve(template, bindings, depth = 0) {
    if (!template.includes('${')) return template
    if (depth > 4) return null
    const filled = template.replace(/\$\{(\w+)\}/g, (whole, name) =>
        bindings.has(name) ? bindings.get(name) : whole,
    )
    return filled === template ? null : resolve(filled, bindings, depth + 1)
}

function bindingsIn(text) {
    const bindings = new Map()
    // `const NAME = 'literal'`, `const NAME = \`template\``, and the `?? 'fallback'` env default.
    const re = /const\s+(\w+)\s*=\s*(?:[\w.]+\s*\?\?\s*)?['"`]([^'"`]*)['"`]/g
    for (const [, name, value] of text.matchAll(re)) bindings.set(name, value)
    return bindings
}

/** Every http(s) image URL a file points the app at, template placeholders resolved. */
function urlsIn(text) {
    const bindings = bindingsIn(text)
    const found = new Map()
    // A quoted or backticked string starting at a host or a `${…}` placeholder and ending in an
    // image extension, optionally followed by a query.
    const re =
        /['"`]((?:https?:\/\/|\$\{\w+\})[^'"`\s]*?\.(?:png|jpe?g|svg|webp|avif|gif)(?:\?[^'"`\s]*)?)['"`]/gi
    for (const [, raw] of text.matchAll(re)) {
        const url = resolve(raw, bindings)
        if (url === null) found.set(raw, null)
        else if (url.startsWith('http')) found.set(url, url)
    }
    return found
}

/** Only ever called for a violation, so the clean path needs no network. */
async function measure(url) {
    try {
        const head = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(20_000) })
        if (!head.ok) return `HTTP ${head.status}`
        const bytes = Number(head.headers.get('content-length') ?? 0)
        return bytes ? `${(bytes / 1024).toFixed(1)} KB at origin` : 'size unknown'
    } catch (error) {
        return `unreachable (${error.message})`
    }
}

async function main() {
    const showAll = process.argv.includes('--all')
    const refs = new Map()

    const files = await sourceFiles(SRC)
    for (const file of files) {
        const text = stripComments(await readFile(file, 'utf8'))
        for (const [key, url] of urlsIn(text)) {
            const entry = refs.get(key) ?? { url, files: [] }
            entry.files.push(file.slice(ROOT.length + 1))
            refs.set(key, entry)
        }
    }

    const unused = await orphans(files)

    const failures = []
    const warnings = []
    for (const [key, { url, files }] of [...refs].sort()) {
        if (url === null) {
            warnings.push({ key, files })
            continue
        }
        if (!IMAGE.has(extname(new URL(url).pathname).toLowerCase())) continue
        failures.push({ url, files, size: await measure(url) })
    }

    for (const { url, files, size } of failures) {
        console.log(`FAIL   ${url}`)
        console.log(`       ${size} — static art must be committed, not fetched`)
        console.log(`       ${files.join(', ')}`)
    }
    for (const path of unused) {
        console.log(`UNUSED ${path}`)
        console.log('       committed, but no source file names it — delete it or wire it up')
    }
    if (showAll) {
        for (const { key, files } of warnings) {
            console.log(`WARN   ${key}`)
            console.log('       built at runtime, so it is content rather than artwork — check by hand')
            console.log(`       ${files.join(', ')}`)
        }
    }

    if (failures.length) {
        console.log(
            `\n${failures.length} remote image${failures.length === 1 ? '' : 's'} in src/. ` +
                'Add a row to scripts/build-cdn-art.mjs and point the module at the committed file — ' +
                'see docs/STATIC_ASSETS.md.',
        )
        process.exitCode = 1
        return
    }
    console.log(
        `No static art is fetched from the CDN. ` +
            `${warnings.length} runtime-built URL${warnings.length === 1 ? '' : 's'}` +
            `${showAll || !warnings.length ? '' : ' (--all to list)'}` +
            `${unused.length ? `, ${unused.length} unused file${unused.length === 1 ? '' : 's'}` : ''}.`,
    )
}

main().catch(error => {
    console.error(error)
    process.exit(1)
})
