import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { LOCALE_LOADERS, loadLocaleBundle } from './locale-bundles'
import { bundles, getLocaleBundle } from './resources'
import { SUPPORTED_LOCALES } from './settings'

/**
 * The three things that hold up "the client downloads one locale, not nine".
 *
 * Each of them fails **silently** if it breaks — the app keeps working, in the right language, and
 * simply costs 100 KB more per page or renders a raw key where a translation used to be. That is
 * exactly the kind of regression a test has to hold, because no screen shows it.
 */

const I18N_DIR = join(process.cwd(), 'src/shared/i18n')

/**
 * The one thing a locale may hold that English does not: a **plural category English has no word
 * for**. English needs `_one` and `_other`; Arabic needs six, so `data_storage_items_few` is a
 * legitimate Arabic entry with no English twin — and without it i18next falls through to English
 * and an Arabic reader is told \"3 items\". It is still the same key, so it is not the leak the
 * superset rule exists to catch: a *new* key invented in one locale has no `_one`/`_other` sibling
 * in English and is still reported.
 */
const CLDR_CATEGORIES = ['zero', 'one', 'two', 'few', 'many', 'other']

function isPluralFormOfAnEnglishKey(key: string, en: Set<string>): boolean {
    const cut = key.lastIndexOf('_')
    if (cut < 0 || !CLDR_CATEGORIES.includes(key.slice(cut + 1))) return false
    const base = key.slice(0, cut)
    return CLDR_CATEGORIES.some(category => en.has(`${base}_${category}`))
}

describe('English is the fallback the client carries', () => {
    /**
     * The load-bearing invariant. `client.ts` bundles English alone and every other locale arrives
     * per request, so English has to be a **superset**: a key that exists only in, say, Vietnamese
     * would resolve for a Vietnamese reader and render as raw text for everyone else — including
     * the reader on a locale that has not caught up with a new key and falls back here.
     *
     * All nine locales are complete today, so the margin is zero — which makes this the moment the
     * check earns its keep: the first key added to a locale and not to English fails here.
     */
    it('holds every key any other locale defines', () => {
        const en = new Set(Object.keys(bundles.en))
        for (const locale of SUPPORTED_LOCALES) {
            const extra = Object.keys(bundles[locale]).filter(
                key => !en.has(key) && !isPluralFormOfAnEnglishKey(key, en),
            )
            expect(extra, `${locale} defines keys English does not`).toEqual([])
        }
    })

    /** English is already in the client bundle; sending it again is the whole payload back. */
    it('is never sent as a per-request bundle', () => {
        expect(getLocaleBundle('en')).toBeNull()
        expect(getLocaleBundle('en-US')).toBeNull()
        expect(getLocaleBundle('de')).toBeNull() // unsupported → English → nothing to send
    })

    it('sends the asked-for locale otherwise', () => {
        expect(getLocaleBundle('vi')).toBe(bundles.vi)
        expect(getLocaleBundle('zh-TW')).toBe(bundles['zh-TW'])
    })
})

describe('the client never reaches the full resource map', () => {
    /**
     * `resources.ts` imports all nine locales. It is imported by `server.ts` (fine — the server
     * bundle is not downloaded) and must not be imported by anything a browser loads, which is
     * `client.ts`, `locale-bundles.ts`, `locale-provider.tsx` and `use-translation.ts`.
     *
     * `import type` would be erased and harmless, but this refuses it too: the difference between
     * a type import and a value import is one keyword, and the failure it causes is invisible.
     * The shared type lives in `settings.ts` precisely so nobody needs the exception.
     */
    it.each(['client.ts', 'locale-bundles.ts', 'locale-provider.tsx', 'use-translation.ts'])(
        '%s does not import ./resources',
        file => {
            const source = readFileSync(join(I18N_DIR, file), 'utf8')
            const imports = source.match(/^import[\s\S]*?from\s+'[^']+'/gm) ?? []
            expect(imports.filter(line => /'\.\/resources'/.test(line))).toEqual([])
        },
    )
})

describe('the switcher can reach every locale', () => {
    /**
     * A locale in `SUPPORTED_LOCALES` with no loader is a language the switcher offers and cannot
     * load — `loadLocaleBundle` would throw on `loaders[lng]` being undefined and the switch would
     * quietly do nothing. Listing the imports by hand is what makes them code-split; this is what
     * keeps the hand-written list honest.
     */
    it('has a loader per supported locale', () => {
        expect(Object.keys(LOCALE_LOADERS).sort()).toEqual([...SUPPORTED_LOCALES].sort())
    })

    it('loads a bundle that matches the statically imported one', async () => {
        await expect(loadLocaleBundle('ko')).resolves.toEqual(bundles.ko)
        // Unsupported codes are clamped to English rather than throwing on a missing loader.
        await expect(loadLocaleBundle('de')).resolves.toEqual(bundles.en)
    })
})
