import { DEFAULT_LOCALE, isSupported, type Locale, toLocale } from '@shared/i18n/settings'

/**
 * The `/app/*` webview contract.
 *
 * `/app/*` is not a page a person browses to — it is a screen the mobile app opens in a
 * WKWebView / Android WebView and presents as part of itself. So the app, not the
 * browser, owns the presentation context: which language the user picked in the app,
 * which theme the app is in. None of that is discoverable server-side (a WebView's
 * `Accept-Language` is the OS locale, not the app's setting, and there is no
 * `prefers-color-scheme` that follows an in-app theme switch), so the app passes it on
 * the URL and `proxy.ts` turns it into request headers the layout can read.
 *
 * The contract is per-request and route-agnostic: every `/app/*` screen gets it, now and
 * later, without touching the page.
 *
 * ```
 * https://tevi.com/app/privacy?lang=vi&theme=dark&platform=ios&v=3.14.0
 * ```
 *
 * | Param      | Values                        | Missing →                        |
 * | ---------- | ----------------------------- | -------------------------------- |
 * | `lang`     | any `SUPPORTED_LOCALES` code  | cookie → `Accept-Language` → en  |
 * | `theme`    | `light` `dark` `system`       | the web default (system)         |
 * | `platform` | `ios` `android`               | unknown                          |
 * | `v`        | app version string            | unknown                          |
 *
 * `lan` and `hl` are accepted as aliases of `lang` — the app team's mini-app URLs
 * already send `lan` (see the legacy `MINIAPP_INTEGRATION.md`), and `hl` is what most
 * webviews send by habit. Everything is optional and anything unrecognised is ignored:
 * a bare `/app/privacy` must keep working, because old app builds will send exactly
 * that.
 *
 * **Never put auth in here.** The webview is same-origin, so it already shares the
 * `tevi.*` localStorage the token store lives in. A token in a URL lands in server logs,
 * the Referer header and the app's history.
 */

/** Prefix that makes a route an app webview screen. */
export const WEBVIEW_PATH_PREFIX = '/app/'

export const WEBVIEW_PARAMS = {
    lang: ['lang', 'lan', 'hl'],
    theme: ['theme'],
    platform: ['platform', 'os'],
    version: ['v', 'app_version'],
} as const

/**
 * Headers `proxy.ts` puts on the forwarded request. They are stripped from every
 * incoming request first, so a client cannot fake webview context on a normal page.
 */
export const WEBVIEW_HEADERS = {
    /** `'1'` when the request is for an `/app/*` screen. */
    flag: 'x-tevi-webview',
    locale: 'x-tevi-webview-locale',
    theme: 'x-tevi-webview-theme',
    platform: 'x-tevi-webview-platform',
    version: 'x-tevi-webview-version',
} as const

/**
 * Cookie mirroring the theme param, so a client-side navigation *inside* the webview
 * (where the entry URL's params are long gone) keeps the same shell. Same name as
 * `STORAGE_KEYS.theme`, which is next-themes' storage key, and the same value set.
 */
export const WEBVIEW_THEME_COOKIE = 'tevi.theme'

export type WebviewTheme = 'light' | 'dark' | 'system'
export type WebviewPlatform = 'ios' | 'android'

export type WebviewContext = {
    isWebview: boolean
    locale?: Locale
    theme?: WebviewTheme
    platform?: WebviewPlatform
    /** App version, as sent. Free-form: it is the app's string, not ours to parse. */
    version?: string
}

export function isWebviewPath(pathname: string): boolean {
    return pathname === '/app' || pathname.startsWith(WEBVIEW_PATH_PREFIX)
}

function firstParam(params: URLSearchParams, names: readonly string[]): string | undefined {
    for (const name of names) {
        const value = params.get(name)?.trim()
        if (value) return value
    }
    return undefined
}

export function parseWebviewTheme(value?: string | null): WebviewTheme | undefined {
    const v = value?.trim().toLowerCase()
    return v === 'light' || v === 'dark' || v === 'system' ? v : undefined
}

function parsePlatform(value?: string): WebviewPlatform | undefined {
    const v = value?.toLowerCase()
    if (v === 'ios' || v === 'iphone' || v === 'ipad') return 'ios'
    if (v === 'android') return 'android'
    return undefined
}

/**
 * Read the contract off a URL. Only recognised values survive — an unsupported `lang`
 * is dropped rather than clamped to English, so the cookie / `Accept-Language` chain
 * still gets its turn.
 */
export function parseWebviewParams(params: URLSearchParams): Omit<WebviewContext, 'isWebview'> {
    return {
        locale: toSupportedLocale(firstParam(params, WEBVIEW_PARAMS.lang)),
        theme: parseWebviewTheme(firstParam(params, WEBVIEW_PARAMS.theme)),
        platform: parsePlatform(firstParam(params, WEBVIEW_PARAMS.platform)),
        version: firstParam(params, WEBVIEW_PARAMS.version),
    }
}

/**
 * `toLocale` clamps anything it does not know to English, which is the wrong answer for
 * a param: `?lang=de` should fall through to the cookie / `Accept-Language` chain, not
 * pin the screen to English. So an English result is only trusted when the code asked
 * for English. (Same trick `fromAcceptLanguage` uses in `i18n/settings.ts`.)
 */
function toSupportedLocale(code?: string): Locale | undefined {
    if (!code) return undefined
    const normalized = code.toLowerCase().replace(/_/g, '-')
    const mapped = toLocale(normalized)
    if (mapped !== DEFAULT_LOCALE) return mapped
    return normalized.startsWith('en') ? DEFAULT_LOCALE : undefined
}

/** Rebuild the context from the headers `proxy.ts` set. Cheap; no validation cost. */
export function readWebviewHeaders(
    get: (name: string) => string | null | undefined,
): WebviewContext {
    const isWebview = get(WEBVIEW_HEADERS.flag) === '1'
    if (!isWebview) return { isWebview: false }
    const locale = get(WEBVIEW_HEADERS.locale)
    return {
        isWebview: true,
        locale: locale && isSupported(locale) ? locale : undefined,
        theme: parseWebviewTheme(get(WEBVIEW_HEADERS.theme)),
        platform: parsePlatform(get(WEBVIEW_HEADERS.platform) ?? undefined),
        version: get(WEBVIEW_HEADERS.version) ?? undefined,
    }
}
