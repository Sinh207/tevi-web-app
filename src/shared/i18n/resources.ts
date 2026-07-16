// Statically-bundled translation resources (self-managed — no Crowdin).
// One flat file per locale, single `translation` namespace, keys `{module}_{slug}`.
// Untranslated locales fall back to English (see settings FALLBACK_LNG).
// When the payload grows too large, switch to lazy loading.

import ar from './locales/ar/translation.json'
import en from './locales/en/translation.json'
import fil from './locales/fil/translation.json'
import id from './locales/id/translation.json'
import ko from './locales/ko/translation.json'
import ms from './locales/ms/translation.json'
import vi from './locales/vi/translation.json'
import zhCN from './locales/zh-CN/translation.json'
import zhTW from './locales/zh-TW/translation.json'

export const resources = {
    en: { translation: en },
    vi: { translation: vi },
    id: { translation: id },
    ms: { translation: ms },
    fil: { translation: fil },
    'zh-TW': { translation: zhTW },
    'zh-CN': { translation: zhCN },
    ko: { translation: ko },
    ar: { translation: ar },
} as const
