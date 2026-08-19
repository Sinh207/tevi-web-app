import { type Locale, type TranslationBundle, toLocale } from './settings'

/**
 * The client's way to get a locale it was not shipped — one code-split chunk per locale, fetched
 * only when someone actually switches language.
 *
 * The static half of the story is in `client.ts` (English, always) and `resources.ts` (the active
 * locale, handed over in the RSC payload). Neither covers the switcher: picking Korean at runtime
 * needs Korean, and bundling all nine against that one action is what cost every page 135 KB.
 *
 * A `Record` of thunks rather than a template-literal `import()`: the latter makes the bundler
 * emit a chunk for **every** file matching the pattern and resolve it by string at runtime, so a
 * typo becomes a 404 instead of a type error. Listed explicitly, a missing locale cannot compile —
 * and `resources.test.ts` pins the map against `SUPPORTED_LOCALES` so a tenth locale cannot be
 * added without a loader.
 */
const loaders: Record<Locale, () => Promise<{ default: TranslationBundle }>> = {
    en: () => import('./locales/en/translation.json'),
    vi: () => import('./locales/vi/translation.json'),
    id: () => import('./locales/id/translation.json'),
    ms: () => import('./locales/ms/translation.json'),
    fil: () => import('./locales/fil/translation.json'),
    'zh-TW': () => import('./locales/zh-TW/translation.json'),
    'zh-CN': () => import('./locales/zh-CN/translation.json'),
    ko: () => import('./locales/ko/translation.json'),
    ar: () => import('./locales/ar/translation.json'),
}

export const LOCALE_LOADERS = loaders

/** Load one locale's bundle. Resolves to `null` if the chunk cannot be fetched (offline). */
export async function loadLocaleBundle(locale: string): Promise<TranslationBundle | null> {
    const lng = toLocale(locale)
    try {
        return (await loaders[lng]()).default
    } catch {
        // The switch is then a no-op against English rather than a screen of raw keys.
        return null
    }
}
