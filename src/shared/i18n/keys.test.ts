import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import en from './locales/en/translation.json'
import { SUPPORTED_LOCALES } from './settings'

const SRC = join(process.cwd(), 'src')
const LOCALES_DIR = join(SRC, 'shared/i18n/locales')

/** Every `.ts`/`.tsx` under `src`, minus the locale JSON itself. */
function sourceFiles(dir: string): string[] {
    const out: string[] = []
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name)
        if (entry.isDirectory()) {
            if (entry.name === 'locales' || entry.name === 'node_modules') continue
            out.push(...sourceFiles(path))
        } else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) {
            out.push(path)
        }
    }
    return out
}

/**
 * `t('some_key')` with a literal key. Computed keys are invisible to this, which is the same
 * limitation the icon-sprite build has and the same reason both prefer literals.
 */
const T_CALL = /\bt\(\s*'([a-z0-9_]+)'/g

/**
 * The CLDR categories i18next appends for a plural key.
 *
 * A plural key exists in the bundle **only** in its suffixed forms — `t('data_storage_items',
 * { count })` resolves to `data_storage_items_one` or `_other`, and the bare key is never a real
 * entry. This test's first run reported exactly that as a missing key, which was the test being
 * wrong rather than the source: without this, adding any plural key makes the suite fail.
 */
const PLURAL_SUFFIXES = ['zero', 'one', 'two', 'few', 'many', 'other']

function isDeclared(key: string, bundle: Record<string, unknown>): boolean {
    if (key in bundle) return true
    return PLURAL_SUFFIXES.some(suffix => `${key}_${suffix}` in bundle)
}

describe('translation keys', () => {
    const files = sourceFiles(SRC)

    /**
     * The failure this catches: i18next falls back per key, so a **missing** key silently renders
     * English — acceptable. A **mistyped** key renders the key itself, so the user reads
     * `channel_action_follow` on a button. That is invisible in review and obvious in production.
     */
    it('every literal t() key exists in en', () => {
        const missing = new Map<string, string[]>()

        for (const file of files) {
            const source = readFileSync(file, 'utf8')
            for (const match of source.matchAll(T_CALL)) {
                const key = match[1]
                if (isDeclared(key, en)) continue
                const relative = file.slice(SRC.length + 1)
                missing.set(key, [...(missing.get(key) ?? []), relative])
            }
        }

        expect(
            Object.fromEntries(missing),
            'keys referenced in source but absent from en/translation.json',
        ).toEqual({})
    })

    it('ships a file for every supported locale', () => {
        const present = readdirSync(LOCALES_DIR, { withFileTypes: true })
            .filter(entry => entry.isDirectory())
            .map(entry => entry.name)
            .sort()
        expect(present).toEqual([...SUPPORTED_LOCALES].sort())
    })

    /**
     * Interpolation is part of a key's contract: `channel_joined_on` without `{{date}}` renders a
     * sentence with a hole in it, and a translator who drops the placeholder breaks only that
     * locale — which is exactly the kind of thing nobody notices until someone switches language.
     */
    it('keeps every {{placeholder}} that en declares', () => {
        const placeholders = (value: string) =>
            [...value.matchAll(/\{\{(\w+)\}\}/g)].map(m => m[1]).sort()

        for (const locale of SUPPORTED_LOCALES) {
            if (locale === 'en') continue
            const path = join(LOCALES_DIR, locale, 'translation.json')
            const translations = JSON.parse(readFileSync(path, 'utf8')) as Record<string, string>

            for (const [key, value] of Object.entries(translations)) {
                const expected = placeholders((en as Record<string, string>)[key] ?? '')
                if (expected.length === 0) continue
                expect(placeholders(value), `${locale} › ${key}`).toEqual(expected)
            }
        }
    })
})
