'use client'

import { getCookieDomain } from '@shared/lib/cookies'
import Cookies from 'js-cookie'
import { useCallback } from 'react'
import { useTranslation as useI18nTranslation } from 'react-i18next'
import { COOKIE_NAME, htmlDir, type Locale, LS_KEY, toLocale } from './settings'

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

    const changeLanguage = useCallback(
        (code: string) => {
            const lng = toLocale(code)
            i18n.changeLanguage(lng)
            try {
                window.localStorage.setItem(LS_KEY, lng)
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
