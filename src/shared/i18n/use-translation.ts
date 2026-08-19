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
     * Storage, cookie and the `<html>` attributes are written **after** the switch lands, so a
     * failure cannot persist a language the app is not actually showing.
     */
    const changeLanguage = useCallback(
        async (code: string) => {
            const lng = toLocale(code)
            if (!i18n.hasResourceBundle(lng, DEFAULT_NS)) {
                const bundle = await loadLocaleBundle(lng)
                if (!bundle) return
                i18n.addResourceBundle(lng, DEFAULT_NS, bundle, false, true)
            }
            await i18n.changeLanguage(lng)
            storage.set(STORAGE_KEYS.locale, lng)
            try {
                Cookies.set(COOKIE_NAME, lng, {
                    domain: getCookieDomain(),
                    expires: 365,
                    path: '/',
                })
            } catch {
                // ignore
            }
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
