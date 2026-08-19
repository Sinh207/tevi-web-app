// Statically-bundled translation resources (self-managed — no Crowdin).
// One flat file per locale, single `translation` namespace, keys `{module}_{slug}`.
//
// ⚠ **Server-side only.** This module pulls in all nine locales — 135 KB minified — which is
// right for `server.ts` (the server bundle is not downloaded) and wrong for anything a browser
// loads. The client bundles English alone and is handed the active locale for the request; see
// `client.ts` and `getLocaleBundle` below. `resources.test.ts` fails if `client.ts` imports this
// file, because the regression is invisible: everything still works, every page just costs
// 100 KB more.

import ar from './locales/ar/translation.json'
import en from './locales/en/translation.json'
import fil from './locales/fil/translation.json'
import id from './locales/id/translation.json'
import ko from './locales/ko/translation.json'
import ms from './locales/ms/translation.json'
import vi from './locales/vi/translation.json'
import zhCN from './locales/zh-CN/translation.json'
import zhTW from './locales/zh-TW/translation.json'
import { type TranslationBundle, toLocale } from './settings'

export const bundles: Record<string, TranslationBundle> = {
    en,
    vi,
    id,
    ms,
    fil,
    'zh-TW': zhTW,
    'zh-CN': zhCN,
    ko,
    ar,
}

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

/**
 * The one bundle this request's client needs — or `null` when it needs none.
 *
 * Read in `app/layout.tsx` and handed to `LocaleProvider` as a prop, so it travels in the RSC
 * payload of the document that already contains the server-rendered text. That is what lets the
 * client bundle carry English only: the active locale arrives with the page, in time for the
 * first client render, so there is no dynamic import to wait for and no flash of raw keys.
 *
 * English returns `null` — it is already in the client bundle as the fallback, and sending it
 * twice would be the whole payload back again. **The fallback is not decoration**: every locale is
 * fully translated today, but a key lands in English first, and until the eight catch up it is the
 * fallback that keeps that key from rendering raw.
 */
export function getLocaleBundle(locale: string): TranslationBundle | null {
    const lng = toLocale(locale)
    if (lng === 'en') return null
    return bundles[lng] ?? null
}
