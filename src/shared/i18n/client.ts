'use client'

import i18next from 'i18next'
import { initReactI18next } from 'react-i18next'
import en from './locales/en/translation.json'
import { DEFAULT_NS, FALLBACK_LNG, NAMESPACES, type TranslationBundle, toLocale } from './settings'

/**
 * Shared client i18next instance.
 *
 * **English is the only locale in the bundle.** It has to be there — it is `FALLBACK_LNG`, so it
 * stands behind every key a locale has yet to translate. All nine are complete today; the fallback
 * is what keeps the *next* key added to English from rendering raw in the other eight. Every *other* locale arrives per request as
 * `bundle`, resolved on the server (`getLocaleBundle`) and handed down through `LocaleProvider`.
 *
 * That split is the whole optimisation: initialisation stays **synchronous**, so the first client
 * render is already in the right language and agrees with the server's HTML — no dynamic import to
 * await, no flash of raw keys, no hydration mismatch — while the client stops downloading the
 * eight locales this visitor is not reading (135 KB → 34 KB).
 */
let initialized = false

function addBundle(lng: string, bundle: TranslationBundle | null | undefined) {
    if (!bundle || lng === 'en') return
    // `deep: false, overwrite: true` — a bundle for a locale is the whole bundle, and re-adding it
    // (a second mount, a switch back) must not merge into a stale copy.
    i18next.addResourceBundle(lng, DEFAULT_NS, bundle, false, true)
}

export function initI18nClient(locale: string, bundle?: TranslationBundle | null) {
    const lng = toLocale(locale)
    if (!initialized) {
        i18next.use(initReactI18next).init({
            lng,
            fallbackLng: FALLBACK_LNG,
            defaultNS: DEFAULT_NS,
            ns: NAMESPACES as unknown as string[],
            // English only; `bundle` is added below, before anything can read a key.
            resources: { en: { translation: en } },
            interpolation: { escapeValue: false },
            react: { useSuspense: false },
        })
        initialized = true
        addBundle(lng, bundle)
    } else {
        // A second mount (a webview screen that mounts its own provider) or a locale change
        // between navigations. Add first, switch second, or `t` renders keys in between.
        addBundle(lng, bundle)
        if (i18next.language !== lng) i18next.changeLanguage(lng)
    }
    return i18next
}

export { i18next }
