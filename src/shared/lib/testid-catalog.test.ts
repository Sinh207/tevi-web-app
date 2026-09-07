import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { TESTID_COMPANIONS } from './test-id'
import { TESTID_SURFACES } from './testid-surfaces'

/**
 * `testids/` is generated from JSX string literals, so nothing at runtime can drift-check it. These
 * read the source as text instead, the way `src/shared/ui/icon-names.test.ts` reads the sprite: if
 * somebody adds a testid and forgets `pnpm testids`, or points a scope at a screen that no longer
 * exists, one of them fails.
 *
 * **The extraction below is deliberately not the generator's.** `scripts/lib/testids.mjs` has a
 * more careful version, and importing it is both impossible (`tsconfig.json`'s `include` covers
 * `.ts`/`.tsx`/`.mts`, not `.mjs`) and beside the point: two independent implementations agreeing is
 * a real check, where one implementation compared against its own output is not. That is exactly
 * why `icon-names.test.ts` re-implements `idsIn()` instead of importing the script.
 *
 * Full contract: `docs/TEST_IDS.md`.
 */
const root = process.cwd()

const catalog = JSON.parse(readFileSync(join(root, 'testids/catalog.json'), 'utf8')) as {
    ids: Record<string, { scope: string | null; companions?: string[]; source: string }>
    surfaces: Record<string, { kind: string; label: string; mountedBy?: string }>
    derivations: Record<string, { accepts: string[]; parts: string[] }>
}
/** Every `.tsx`/`.ts` under `src/`, minus tests and the dev harness (which 404s in production). */
function sources(dir: string, out: string[] = []): string[] {
    for (const name of readdirSync(dir)) {
        const path = join(dir, name)
        if (statSync(path).isDirectory()) {
            sources(path, out)
        } else if (
            /\.tsx?$/.test(name) &&
            !/\.(test|spec)\.tsx?$/.test(name) &&
            !path.includes('/app/(web)/dev/')
        ) {
            out.push(path)
        }
    }
    return out
}

/** Blank out comments, keeping offsets — every doc comment here carries worked examples. */
function withoutComments(src: string): string {
    return src
        .replace(/\/\*[\s\S]*?\*\//g, block => block.replace(/[^\n]/g, ' '))
        .replace(
            /(^|[^:])\/\/[^\n]*/g,
            (match, lead) => lead + ' '.repeat(match.length - lead.length),
        )
}

const files = sources(join(root, 'src'))

/** Literal ids in the source, found with this file's own regex. */
const idsInSource = new Map<string, string>()
for (const file of files) {
    const src = withoutComments(readFileSync(file, 'utf8'))
    for (const match of src.matchAll(/(?:data-testid|testId)="([^"]+)"/g)) {
        idsInSource.set(match[1], file.slice(root.length + 1))
    }
    for (const match of src.matchAll(/\btestId:\s*'([^']+)'/g)) {
        idsInSource.set(match[1], file.slice(root.length + 1))
    }
}

describe('testids/catalog.json', () => {
    it('matches the source tree', () => {
        const missing = [...idsInSource.keys()].filter(id => !(id in catalog.ids))
        const stale = Object.keys(catalog.ids).filter(id => !idsInSource.has(id))
        expect(
            { missing, stale },
            'testids/catalog.json is out of date. Run `pnpm testids` and commit testids/. It is ' +
                'generated but committed for the same reason src/shared/ui/icon-names.ts is: QC ' +
                'reads it out of git, with no Node toolchain, so it has to be a file in the tree ' +
                'and not a build step.',
        ).toEqual({ missing: [], stale: [] })
    })

    it('declares every surface it uses', () => {
        const undeclared = Object.entries(catalog.ids)
            .filter(([, entry]) => entry.scope === null)
            .map(([id]) => id)
        expect(
            undeclared,
            'These ids have no declared surface, so the catalog cannot say which screen they are ' +
                'on. Add the scope to src/shared/lib/testid-surfaces.ts.',
        ).toEqual([])
    })

    it('only uses approved companion attributes', () => {
        const approved = new Set<string>(TESTID_COMPANIONS)
        const rogue = Object.entries(catalog.ids).flatMap(([id, entry]) =>
            (entry.companions ?? [])
                .filter(attr => !approved.has(attr))
                .map(attr => `${id}: ${attr}`),
        )
        expect(
            rogue,
            'The companion vocabulary is closed (TESTID_COMPANIONS in test-id.ts) so the catalog ' +
                'can say, per element type, which attribute carries its identity.',
        ).toEqual([])
    })
})

describe('the e2e suite', () => {
    /**
     * The `TestIdPart`s some component derives with `subTestId`, from the catalog's own `derivations`
     * map — `group`, `row`, `skeleton`, `sentinel`, `close`, and the rest.
     *
     * A derived id is **not** a literal anywhere in `src/`, because it is assembled at render time
     * from a `testId` prop plus a part. So a spec locating `my-star-ledger-row` — an element that
     * genuinely exists — read as missing until this was taught the difference, which is a guard
     * failing on correct code: the worst kind, because the fix looks like weakening the guard.
     */
    const derivedParts = new Set(Object.values(catalog.derivations).flatMap(entry => entry.parts))

    /**
     * Is this id a literal, or a literal plus a part something derives?
     *
     * The check stays deliberately loose on *which* component derives it: proving that
     * `my-star-ledger` is the `testId` handed to `LedgerPanel` specifically would mean following a
     * prop across files, which is the generator's job and not a text scan's. What it does still
     * catch is the case it exists for — a renamed or deleted attribute, where the **base** stops
     * being a literal in the source and the whole id goes with it.
     */
    const exists = (id: string): boolean => {
        if (idsInSource.has(id)) return true
        const cut = id.lastIndexOf('-')
        if (cut <= 0) return false
        return derivedParts.has(id.slice(cut + 1)) && idsInSource.has(id.slice(0, cut))
    }

    it('only locates testids that exist', () => {
        const specs = readdirSync(join(root, 'e2e')).filter(name => name.endsWith('.spec.ts'))
        const missing: string[] = []
        for (const name of specs) {
            const src = readFileSync(join(root, 'e2e', name), 'utf8')
            for (const match of src.matchAll(/getByTestId\('([^']+)'\)/g)) {
                if (!exists(match[1])) missing.push(`${name}: ${match[1]}`)
            }
        }
        expect(
            missing,
            'These specs locate by a testid that is not in the source, so they can only fail — and ' +
                'they fail in the e2e job, minutes later, reading as a product regression rather ' +
                'than a rename. Either restore the attribute or update the spec.',
        ).toEqual([])
    })
})

describe('src/shared/lib/testid-surfaces.ts', () => {
    it('is what the catalog was built from', () => {
        expect(Object.keys(catalog.surfaces).sort()).toEqual(Object.keys(TESTID_SURFACES).sort())
    })

    it('gives every shared surface a mountedBy that exists', () => {
        const broken = Object.entries(TESTID_SURFACES)
            .filter(([, surface]) => surface.kind !== 'screen')
            .filter(
                ([, surface]) => !surface.mountedBy || !existsSync(join(root, surface.mountedBy)),
            )
            .map(([name, surface]) => `${name}: ${surface.mountedBy ?? '(none)'}`)
        expect(
            broken,
            'A surface that is not a single screen owes a `mountedBy` — it is the answer to "why ' +
                'does this id appear on a route that has nothing to do with it", and a path that ' +
                'no longer exists is a catalog that has started lying.',
        ).toEqual([])
    })
})
