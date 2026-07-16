'use client'

import i18next from 'i18next'
import { initReactI18next } from 'react-i18next'
import { resources } from './resources'
import { DEFAULT_NS, FALLBACK_LNG, NAMESPACES, toLocale } from './settings'

/**
 * Shared client i18next instance. Resources are statically bundled (self-managed,
 * no Crowdin), so the very first paint is correct with no flash of raw keys and
 * server/client agree. Initialized once with the server-resolved locale.
 */
let initialized = false

export function initI18nClient(locale: string) {
    const lng = toLocale(locale)
    if (!initialized) {
        i18next.use(initReactI18next).init({
            lng,
            fallbackLng: FALLBACK_LNG,
            defaultNS: DEFAULT_NS,
            ns: NAMESPACES as unknown as string[],
            resources,
            interpolation: { escapeValue: false },
            react: { useSuspense: false },
        })
        initialized = true
    } else if (i18next.language !== lng) {
        i18next.changeLanguage(lng)
    }
    return i18next
}

export { i18next }
