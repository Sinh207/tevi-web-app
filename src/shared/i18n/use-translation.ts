'use client'

import { getCookieDomain } from '@shared/lib/cookies'
import { STORAGE_KEYS, storage } from '@shared/lib/storage'
import Cookies from 'js-cookie'
import { useCallback } from 'react'
import { useTranslation as useI18nTranslation } from 'react-i18next'
import { loadLocaleBundle } from './locale-bundles'
import { COOKIE_NAME, DEFAULT_NS, htmlDir, type Locale, toLocale } from './settings'

export interface LanguageOption {
    code: Locale
    name: string
    flag: string
}

/** Enabled language switcher options. */
export const LANGUAGES: LanguageOption[] = [
    { code: 'en', name: 'English', flag: '🇺🇸' },
    { code: 'vi', name: 'Tiếng Việt', flag: '🇻🇳' },
    { code: 'id', name: 'Indonesia', flag: '🇮🇩' },
    { code: 'fil', name: 'Filipino', flag: '🇵🇭' },
    { code: 'zh-TW', name: '繁體中文', flag: '🇹🇼' },
    { code: 'zh-CN', name: '简体中文', flag: '🇨🇳' },
    { code: 'ko', name: '한국어', flag: '🇰🇷' },
    { code: 'ms', name: 'Bahasa Melayu', flag: '🇲🇾' },
]

export function useTranslation() {
    const { t, i18n, ready } = useI18nTranslation()

    /**
     * Switch language.
     *
     * **Async, because the client only carries English plus the locale the page was served in**
     * (see `i18n/client.ts`): picking a third one has to fetch its chunk first. Fire-and-forget is
     * fine for callers — nothing renders differently until the bundle is in — and a failed fetch
     * leaves the current language alone rather than switching to a screen of raw keys.
     *
     * Nothing is persisted until the bundle is in hand, so a failed fetch cannot leave behind a
     * language the app is not actually showing.
     *
     * ## ⚠ The **cookie** is written before the switch, and that order is load-bearing
     *
     * `i18n.changeLanguage` repaints **client** components and nothing else. Every string rendered
     * on the server — `getServerT()`, in 80 files, including whole pages (`terms`, `privacy`,
     * `letter`), every `loading.tsx` and both 404s — was resolved from the `tevi.locale` cookie
     * during *that* request's render, and a client-side switch cannot reach back into HTML that has
     * already been sent. So `LocaleProvider` asks the router to re-request the route's RSC payload
     * when it sees the language move away from the one the server rendered — and it learns that from
     * i18next's own `languageChanged`, which fires *inside* the call below. A cookie written after
     * that line is a cookie written after the refresh has already been requested, i.e. a server
     * re-render in the language being left behind.
     *
     * `storage` and the `<html>` attributes are not in that race and stay after the switch.
     */
    const changeLanguage = useCallback(
        async (code: string) => {
            const lng = toLocale(code)
            if (!i18n.hasResourceBundle(lng, DEFAULT_NS)) {
                const bundle = await loadLocaleBundle(lng)
                if (!bundle) return
                i18n.addResourceBundle(lng, DEFAULT_NS, bundle, false, true)
            }
            try {
                Cookies.set(COOKIE_NAME, lng, {
                    domain: getCookieDomain(),
                    expires: 365,
                    path: '/',
                })
            } catch {
                // ignore
            }
            await i18n.changeLanguage(lng)
            storage.set(STORAGE_KEYS.locale, lng)
            if (typeof document !== 'undefined') {
                document.documentElement.lang = lng
                document.documentElement.dir = htmlDir(lng)
            }
        },
        [i18n],
    )

    return {
        t,
        i18n,
        isReady: ready,
        currentLanguage: i18n.language,
        LANGUAGES,
        changeLanguage,
    }
}
