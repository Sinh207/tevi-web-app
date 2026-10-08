/**
 * i18n config — isomorphic (safe on server + client).
 *
 * Translations are SELF-MANAGED in-repo (no Crowdin), one flat
 * src/shared/i18n/locales/<lng>/translation.json per locale. The server holds all nine
 * (resources.ts); the **client bundles English only** and is handed the request's locale as a
 * prop, with a code-split chunk per locale behind the switcher (client.ts, locale-bundles.ts).
 * The switcher surfaces UI_LOCALES; untranslated locales fall back to English — which is most of
 * the app for most locales, so that fallback is load-bearing (see resources.test.ts).
 *
 * ## Self-managed, but legacy's Crowdin is the **reference** for anything it also ships
 *
 * "No Crowdin" is about the pipeline, not about inventing wording. Most strings on a ported screen
 * exist in `../tevi-web-app/public/locales/<lng>/common.json`, already translated and approved, and
 * a fresh translation of the same sentence is a second brand voice for no reason. So: if legacy
 * ships the string, take its translation; if legacy left it in English, translate it; if legacy has
 * no such string, author it from the vocabulary the locale already uses here.
 *
 * An audit of `premium_*` (93 keys × 8 locales) found 76-78 per locale already matching Crowdin
 * exactly, and four classes of defect worth knowing about because **every one of them was silent**:
 *
 * - **17 keys missing** in `ar` (16) and `ko` (1), including the sentence in front of a
 *   non-refundable charge. i18next falls back to English without a warning, and
 *   `resources.test.ts` asserts only that *English is a superset* — the direction that catches a
 *   stray key, not a missing translation.
 * - **A machine-translation sense error**: `premium_compare_free` was `حر` in Arabic — "free" as in
 *   unrestricted, never "free of charge" — on the label opposite `Premium` in a price comparison.
 * - **A collision**: the same key was `Cơ bản` in Vietnamese, which is this file's own translation of
 *   `Basic`, so a `Free | Premium` bar read `Basic | Premium`.
 * - **A trailing period on a button label** (`premium_confirm_yes`, `ko`).
 *
 * Two divergences from Crowdin are **deliberate** and should not be "corrected" back:
 *
 * - `premium_active_title` keeps no `!`, because our English ("You're all set") has none. Legacy's
 *   translations add one in several locales.
 * - `premium_active_body` drops legacy's mid-sentence `<br/>`. A hard line break inside a translated
 *   string is a layout hack that is wrong at every width but the one it was tuned for.
 * - `premium_confirm_yes` keeps the emphatic "Yes, I confirm" in **every** locale. Crowdin is
 *   inconsistent here — five keep it, three reduce it to a bare "Confirm" — and the emphasis is
 *   load-bearing: it is the friction in front of a purchase the dialog has just called
 *   non-refundable.
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

/**
 * **Every key English defines**, as a union — so a mistyped one is a *compile* error.
 *
 * `keys.test.ts` scans `t('literal')` calls and catches a key that exists in no locale, which is the
 * failure that renders a raw `snake_case` string on screen in all nine languages at once. What it
 * cannot see is the pattern this type exists for: a helper that **returns** a key, which the call site
 * then hands to `t(variable)`. There are twelve of those (`toSignInErrorKey`, `payoutFeeLabel`,
 * `payoutConfigLabelKey` and friends) and sixty-four such call sites, and a typo in any of them was
 * invisible to every check in this repo — the helpers' own unit tests assert the string they return,
 * never that it resolves to anything.
 *
 * ## `typeof import(...)`, in a type position only
 *
 * Fully erased, so **nothing is added to any bundle** — the English JSON is already in the client
 * bundle via `client.ts`, but this would ship nothing even if it were not. It is deliberately *not*
 * derived from `resources.ts`, for the reason `TranslationBundle` above gives: that module pulls all
 * nine locales, and a type import one careless edit away from a value import is 135 KB.
 *
 * ## Why `t`'s own parameter is not narrowed
 *
 * `t` comes straight out of react-i18next (`useTranslation`), whose overloads carry interpolation,
 * plural options and `returnObjects`. Narrowing its key would mean wrapping it and re-declaring that
 * surface — and it would reject `t(variable)` everywhere until every producer of a key is typed,
 * which is a much larger change for the same guarantee this type gives at the source.
 */
export type TranslationKey = keyof typeof import('./locales/en/translation.json')

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

/**
 * `?lang=` on a website URL — the one place a locale is part of the **address**.
 *
 * It exists for search engines: every other signal (the cookie, `Accept-Language`) is invisible to a
 * crawler, which sends neither, so without it each URL has exactly one indexable language. With it,
 * `/premium?lang=vi` is a distinct URL that always renders Vietnamese, which is what `hreflang` needs
 * to point at (`shared/config/seo.ts`).
 *
 * The same name the webview contract uses, and the one legacy read (`?lang=` / `?lng=`), so links
 * already in the wild keep working.
 */
export const URL_LOCALE_PARAM = 'lang'

/**
 * Set by `proxy.ts` from `?lang=` — stripped from every incoming request first, like the webview
 * headers, so a client cannot claim one. Read by the root layout and `getServerLocale`.
 */
export const URL_LOCALE_HEADER = 'x-tevi-url-locale'

/**
 * A shipped locale named by a URL, or `null`. Lenient about spelling (`vi`, `vi-VN`, `vi_VN`,
 * `zh-tw`) and strict about meaning: an unsupported language is ignored rather than clamped to
 * English, so `?lang=fr` does not override a French reader's cookie with English.
 */
export function parseUrlLocale(value: string | null | undefined): Locale | null {
    if (!value) return null
    const locale = toLocale(value)
    return locale !== DEFAULT_LOCALE || value.toLowerCase().startsWith('en') ? locale : null
}

/** The chain: URL (`?lang=`) → cookie → Accept-Language → English. */
export function resolveInitialLocale(opts?: {
    urlValue?: string | null
    cookieValue?: string | null
    acceptLanguage?: string | null
}): Locale {
    const fromUrl = parseUrlLocale(opts?.urlValue)
    if (fromUrl) return fromUrl
    if (opts?.cookieValue) return toLocale(opts.cookieValue)
    return fromAcceptLanguage(opts?.acceptLanguage) ?? DEFAULT_LOCALE
}
