#!/usr/bin/env node
/**
 * `pnpm lint:icons` — **icons come only from the DS sprite**, the set `/dev/icons` shows.
 *
 * `<Icon name>` is already held to that set by its type (`src/shared/ui/icon-names.ts` is generated
 * from `design-system/tevi-icons.svg` and nothing else). What a type cannot see is the way around
 * it: an inline `<svg>` drawn in a component, or an icon package. This catches both.
 *
 * - **An inline `<svg>` element** in `src/` fails unless its file is in `ALLOWED` below, each with
 *   the reason it is not an interface glyph: a third party's trademark, an illustration, a chart, a
 *   progress ring. Adding a file there is a review decision, which is the point — it is the one list
 *   of every shape this app draws that design did not put in the library.
 * - **An icon library** in `package.json` fails outright.
 *
 * Skipped: `src/shared/ui/` (DS-ported primitives, which render the sprite), `/dev/*` harnesses,
 * tests. Comments are stripped first, so a note that *mentions* `<svg>` is not a violation.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'

const ROOT = process.cwd()

/** Files that may draw an `<svg>`, and why it is not an icon. Keep each reason honest. */
const ALLOWED = new Map([
    ['src/features/auth/components/provider-marks.tsx', 'Google / Apple sign-in marks — trademarks the providers require'],
    ['src/shared/components/store-badge.tsx', 'App Store / Google Play badges — trademarks'],
    ['src/features/share/components/brand-marks.tsx', 'Messenger mark — a trademark the library lacks (kept by decision)'],
    ['src/shared/components/phone-mark.tsx', "Get App's phone — kept by decision; the library has no phone"],
    ['src/shared/components/splash.tsx', 'the brand splash — brand art, not a glyph'],
    ['src/features/analytics/components/metric-chart.tsx', 'a chart'],
    ['src/features/event/components/event-exclusive-overlay.tsx', 'a countdown progress ring'],
])

/** Icon packages — any of these in `package.json` is a second icon set. */
const ICON_PACKAGES = [
    /^lucide/,
    /^react-icons$/,
    /^@heroicons\//,
    /^@mui\/icons-material$/,
    /^@phosphor-icons\//,
    /^@tabler\/icons/,
    /^react-feather$/,
    /^@fortawesome\//,
    /^@iconify\//,
]

const SKIP = [/^src\/shared\/ui\//, /^src\/app\/\(web\)\/dev\//, /\.test\.tsx?$/]

function files(dir) {
    return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
        const path = join(dir, entry.name)
        if (entry.isDirectory()) return files(path)
        return /\.tsx$/.test(entry.name) ? [path] : []
    })
}

/** Block and line comments out; strings are left, since an `<svg` in a string is not markup. */
function stripComments(source) {
    return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:"'`])\/\/.*$/gm, '$1')
}

const problems = []

for (const path of files(join(ROOT, 'src'))) {
    const rel = relative(ROOT, path).split('\\').join('/')
    if (SKIP.some(re => re.test(rel)) || ALLOWED.has(rel)) continue
    const source = readFileSync(path, 'utf8')
    if (/<svg[\s>]/.test(stripComments(source))) {
        // Report the line in the file as written: the first `<svg` that is not on a comment line.
        const lines = source.split('\n')
        const index = lines.findIndex(
            text => /<svg[\s>]|<svg$/.test(text) && !/^\s*(\*|\/\*|\/\/)/.test(text),
        )
        const line = index + 1
        problems.push(
            `${rel}:${line}: an inline <svg>. Use <Icon name="…"> from @shared/ui/icon — the glyphs at /dev/icons.`,
        )
    }
}

const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))
for (const name of Object.keys({ ...pkg.dependencies, ...pkg.devDependencies })) {
    if (ICON_PACKAGES.some(re => re.test(name))) {
        problems.push(`package.json: "${name}" is an icon library. Icons come only from the DS sprite.`)
    }
}

for (const rel of ALLOWED.keys()) {
    try {
        readFileSync(join(ROOT, rel))
    } catch {
        problems.push(`scripts/check-icons.mjs: ALLOWED names ${rel}, which does not exist — remove it.`)
    }
}

if (problems.length > 0) {
    console.error('Icons that do not come from the DS sprite (/dev/icons):\n')
    for (const problem of problems) console.error(`  ${problem}`)
    console.error(`\n${problems.length} problem(s). See CLAUDE.md → Styling → Icons.`)
    process.exit(1)
}
console.log(`OK — every icon comes from the DS sprite (${ALLOWED.size} allowed non-icon marks).`)
