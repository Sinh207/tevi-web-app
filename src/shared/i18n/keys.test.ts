import { readdirSync, readFileSync } from 'node:fs'
import { extname, join, relative, sep } from 'node:path'
import { describe, expect, it } from 'vitest'
import en from './locales/en/translation.json'

/**
 * **Every key a `t()` call names must exist in English.**
 *
 * `resources.test.ts` holds three invariants and none of them catches this: English being a *superset*
 * of the other eight passes happily when a key is in **no** locale, and i18next then renders the key
 * itself — so the screen prints `auth_two_fa_hint_note` where a sentence belongs. That is what
 * happened, on a line added while this test did not exist, and it is invisible in every locale at once
 * rather than eight.
 *
 * English is `FALLBACK_LNG`, so one entry there is enough to make a screen correct everywhere. Which is
 * also why this asserts against English alone: a key present in English and missing elsewhere is a
 * *translation* gap, deliberately allowed, and `resources.test.ts` is where that is measured.
 *
 * ## What it cannot see — and what covers the rest
 *
 * Only **literal** arguments: `t('auth_sign_in')`. A key passed as a variable is not resolvable here,
 * and this repo has a real pattern of those: `toSignInErrorKey`, `payoutFeeLabel`,
 * `payoutConfigLabelKey` and nine more *return* a key that the call site hands to `t(variable)` — 64
 * such call sites.
 *
 * Those are no longer this test's problem. Every one of those helpers now returns
 * **`TranslationKey`** (`shared/i18n/settings.ts`), a union of English's keys, so a typo in a mapper
 * or in one of the lookup tables behind it is a **compile error** — which is strictly better than a
 * test, and is where the guarantee belongs. Verified by planting a typo in three of them.
 *
 * What remains uncovered is a key built at runtime by concatenation. There is none today, and the
 * shape is worth refusing rather than checking: an interpolated key cannot be found by a grep, which
 * is how a locale file grows entries nothing reads and loses entries something does.
 */

const SRC = join(import.meta.dirname, '..', '..')
const SOURCE = new Set(['.ts', '.tsx'])

/** Tests name keys that do not have to exist — `t: key => key` stubs, and assertions about mappers. */
const IGNORE = /\.(test|spec)\.tsx?$/

function sourceFiles(dir: string): string[] {
    const out: string[] = []
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name)
        if (entry.isDirectory()) {
            out.push(...sourceFiles(path))
        } else if (SOURCE.has(extname(entry.name)) && !IGNORE.test(entry.name)) {
            out.push(path)
        }
    }
    return out
}

/**
 * `t('key')`, `t("key")`, `t(`key`)` — and the second argument, if any, is ignored.
 *
 * Anchored on a word boundary before `t` so `getServerT(`, `useTranslation(` and `formatT(` do not
 * match; the capture requires the whole argument to be one literal, so `t(cond ? 'a' : 'b')` is
 * skipped rather than half-read.
 */
const CALL = /\bt\(\s*(['"`])([a-z][a-z0-9_]*)\1\s*[,)]/g

/** Comments are stripped: a key named in prose is documentation, not a call. */
function stripComments(text: string): string {
    return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1')
}

/**
 * i18next's plural suffixes, which are the reason a key can be "present" without appearing verbatim.
 *
 * `t('notification_count', { count })` resolves to `notification_count_one` or `_other`; the bare key
 * is never stored. Nine of the eleven hits on this test's first run were exactly that — so a check
 * that missed them would be nine false alarms against two real ones, and would have been switched off
 * within a day.
 *
 * `_zero`/`_two`/`_few`/`_many` are Arabic's extra categories (see `resources.test.ts`). They are
 * accepted here because a locale is allowed to carry more forms than English does, and English is what
 * this test measures against.
 */
const PLURAL_SUFFIXES = ['_zero', '_one', '_two', '_few', '_many', '_other']

describe('every translated string has a key', () => {
    it('names only keys English defines', () => {
        const englishKeys = new Set(Object.keys(en))
        const known = (key: string) =>
            englishKeys.has(key) || PLURAL_SUFFIXES.some(suffix => englishKeys.has(key + suffix))
        const missing: string[] = []

        for (const path of sourceFiles(SRC)) {
            const text = stripComments(readFileSync(path, 'utf8'))
            for (const [, , key] of text.matchAll(CALL)) {
                if (!known(key)) {
                    missing.push(`${relative(SRC, path).split(sep).join('/')}: ${key}`)
                }
            }
        }

        expect(
            [...new Set(missing)].sort(),
            'These `t()` calls name a key that is in no locale, so i18next renders the key itself — a raw ' +
                'snake_case string where a sentence belongs, in every language at once. Add it to ' +
                'src/shared/i18n/locales/en/translation.json (English is the fallback, so one entry fixes ' +
                'all nine).',
        ).toEqual([])
    })

    /**
     * The plural handling is load-bearing, so it is asserted rather than left to the pass above: a
     * pluralised key is stored **only** with its suffixes, so a check that looked for the bare key
     * would report every one of them.
     */
    it('accepts a pluralised key that is stored only with its suffixes', () => {
        const englishKeys = Object.keys(en)
        expect(englishKeys).not.toContain('notification_count')
        expect(englishKeys).toContain('notification_count_one')
        expect(englishKeys).toContain('notification_count_other')
    })

    /** The scan has to actually find calls — a broken regex would make this suite vacuously green. */
    it('finds a substantial number of calls to check', () => {
        let found = 0
        for (const path of sourceFiles(SRC)) {
            found += [...stripComments(readFileSync(path, 'utf8')).matchAll(CALL)].length
        }
        expect(found).toBeGreaterThan(500)
    })
})
