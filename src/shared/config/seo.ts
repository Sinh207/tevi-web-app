import { DEFAULT_LOCALE, type Locale, UI_LOCALES, URL_LOCALE_PARAM } from '@shared/i18n/settings'
import type { Metadata } from 'next'

type OpenGraph = NonNullable<Metadata['openGraph']>

export const SITE_NAME = 'Tevi'

/**
 * The share card for a page that has no picture of its own — legacy's `bannerMeta`, cropped to the
 * 1.91:1 box unfurlers draw and committed (`scripts/build-cdn-art.mjs`, row `og-default`).
 *
 * The dimensions are declared because Facebook will not render a large card for an image it has not
 * fetched yet unless it is told the size up front; a share made seconds after a deploy otherwise
 * goes out as a thumbnail.
 */
export const DEFAULT_OG_IMAGE = {
    url: '/illustrations/brand/og-default.jpg',
    width: 1200,
    height: 630,
    type: 'image/jpeg',
    alt: SITE_NAME,
} as const

/**
 * A page's `openGraph`, with the site-wide parts filled in.
 *
 * **Every page that declares `openGraph` must go through this.** Next merges metadata per field, and
 * `openGraph` is one field: a page that sets its own replaces the root layout's *whole* object, not
 * just the keys it names. So `siteName` and the fallback image vanish from exactly the pages that
 * bothered to write a share card — which is how every policy page shipped with no image.
 *
 * `twitter` needs nothing equivalent: Next fills `twitter:title|description|image` from `openGraph`
 * when a page leaves them out, and picks `summary_large_image` whenever an image is present.
 */
export function siteOpenGraph(og: OpenGraph = {}): OpenGraph {
    return {
        siteName: SITE_NAME,
        type: 'website',
        ...og,
        images: og.images ?? [DEFAULT_OG_IMAGE],
    } as OpenGraph
}

/**
 * The `hreflang` value per locale. Our codes are BCP 47 and Google reads ISO 639-1 — they agree
 * everywhere except Filipino, which ISO 639-1 has no code for; `tl` (Tagalog) is the code Google
 * matches Filipino searches against, where `fil` would be dropped as unknown.
 */
const HREFLANG: Record<(typeof UI_LOCALES)[number], string> = {
    en: 'en',
    vi: 'vi',
    id: 'id',
    fil: 'tl',
    'zh-TW': 'zh-TW',
    'zh-CN': 'zh-CN',
    ko: 'ko',
    ms: 'ms',
}

/**
 * `path` in `locale`: `?lang=` for an advertised language, else the bare path — for English (what a
 * crawler gets bare) and for a locale outside `UI_LOCALES` (`ar`), which `hreflang` does not list,
 * so a URL naming it is folded onto the bare page rather than becoming a canonical of its own.
 */
export function localizedPath(path: string, locale: Locale | null): string {
    const advertised = locale !== null && locale !== DEFAULT_LOCALE && locale in HREFLANG
    return advertised ? `${path}?${URL_LOCALE_PARAM}=${locale}` : path
}

/**
 * `alternates` for a page that exists in every UI locale — its canonical **and** its `hreflang` set.
 *
 * The two are one decision, because `hreflang` only holds if each language version is canonical to
 * **itself**: `/premium?lang=vi` canonicalising to `/premium` tells Google the Vietnamese page is a
 * duplicate of the English one, and the whole set is then ignored. So the canonical follows the
 * locale the **URL** names (`getUrlLocale`) — never the cookie's, which a crawler does not have and
 * which would make one URL claim a different canonical per visitor.
 *
 * The bare URL is `x-default` as well as `en`: it negotiates from the cookie and `Accept-Language`
 * for a person, and a crawler, sending neither, gets English there.
 *
 * Only for pages whose **content** is translated. The policies are English at every locale (Legal
 * has no translations, `features/legal` says why), and a space page is its creator's own words —
 * nine URLs for one text is duplicate content, not a language set.
 */
export function siteAlternates(path: string, urlLocale: Locale | null): Metadata['alternates'] {
    const languages: Record<string, string> = {}
    for (const locale of UI_LOCALES) languages[HREFLANG[locale]] = localizedPath(path, locale)
    languages['x-default'] = path
    return { canonical: localizedPath(path, urlLocale), languages }
}
