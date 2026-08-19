/**
 * i18n config — isomorphic (safe on server + client).
 *
 * Translations are SELF-MANAGED in-repo (no Crowdin), one flat
 * src/shared/i18n/locales/<lng>/translation.json per locale. The server holds all nine
 * (resources.ts); the **client bundles English only** and is handed the request's locale as a
 * prop, with a code-split chunk per locale behind the switcher (client.ts, locale-bundles.ts).
 * The switcher surfaces UI_LOCALES; untranslated locales fall back to English — which is most of
 * the app for most locales, so that fallback is load-bearing (see resources.test.ts).
 */

export const SUPPORTED_LOCALES = [
    'en',
    'vi',
    'id',
    'ms',
    'fil',
    'zh-TW',
    'zh-CN',
    'ko',
    'ar',
] as const

/** Shown in the language switcher UI. (ar is supported for RTL but not surfaced.) */
export const UI_LOCALES = ['en', 'vi', 'id', 'fil', 'zh-TW', 'zh-CN', 'ko', 'ms'] as const

/** Right-to-left locales. */
export const RTL_LOCALES = ['ar'] as const

export const DEFAULT_LOCALE = 'en'
export const FALLBACK_LNG = 'en'
export const DEFAULT_NS = 'translation'
export const NAMESPACES = ['translation'] as const
export const COOKIE_NAME = 'tevi.locale'

export type Locale = (typeof SUPPORTED_LOCALES)[number]

/**
 * One locale's flat key → string map.
 *
 * Declared here, in the isomorphic module, and not next to the bundles themselves: `resources.ts`
 * imports all nine locales, so a client file reaching for the *type* would be one careless
 * `import type` → `import` away from downloading 135 KB of translations it cannot read.
 */
export type TranslationBundle = Record<string, string>

export function isSupported(code: string): code is Locale {
    return (SUPPORTED_LOCALES as readonly string[]).includes(code)
}

export function isRtl(locale: string): boolean {
    return (RTL_LOCALES as readonly string[]).includes(locale)
}

export function htmlDir(locale: string): 'rtl' | 'ltr' {
    return isRtl(locale) ? 'rtl' : 'ltr'
}

/** Clamp any code to a shipped locale (keeps Chinese region, aliases tl→fil). */
export function toLocale(code?: string | null): Locale {
    if (!code) return DEFAULT_LOCALE
    const c = code.toLowerCase().replace(/_/g, '-')
    if (c.startsWith('zh')) return /hant|tw|hk|mo/.test(c) ? 'zh-TW' : 'zh-CN'
    // exact match (e.g. es-ES, pt-PT)
    const exact = SUPPORTED_LOCALES.find(l => l.toLowerCase() === c)
    if (exact) return exact
    const base = c.split('-')[0]
    const alias: Record<string, string> = { tl: 'fil' }
    const norm = alias[base] ?? base
    const found = SUPPORTED_LOCALES.find(l => l.toLowerCase() === norm)
    return found ?? DEFAULT_LOCALE
}

function fromAcceptLanguage(header?: string | null): Locale | null {
    if (!header) return null
    const parts = header
        .split(',')
        .map(p => {
            const [tag, ...params] = p.trim().split(';')
            const q = params.find(x => x.trim().startsWith('q='))
            return { tag: tag.trim(), q: q ? Number.parseFloat(q.split('=')[1]) || 0 : 1 }
        })
        .filter(p => p.tag && p.tag !== '*')
        .sort((a, b) => b.q - a.q)
    for (const { tag } of parts) {
        const l = toLocale(tag)
        if (l !== DEFAULT_LOCALE || tag.toLowerCase().startsWith('en')) return l
    }
    return null
}

/** First-visit chain: cookie → Accept-Language → English. */
export function resolveInitialLocale(opts?: {
    cookieValue?: string | null
    acceptLanguage?: string | null
}): Locale {
    if (opts?.cookieValue) return toLocale(opts.cookieValue)
    return fromAcceptLanguage(opts?.acceptLanguage) ?? DEFAULT_LOCALE
}
