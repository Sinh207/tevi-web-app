import { createInstance, type TFunction } from 'i18next'
import { cookies, headers } from 'next/headers'
import { resources } from './resources'
import {
    COOKIE_NAME,
    DEFAULT_NS,
    FALLBACK_LNG,
    NAMESPACES,
    resolveInitialLocale,
    toLocale,
} from './settings'

/**
 * Server-side translation for RSC / server components. Resources are the same
 * statically-bundled set used on the client, so server and client agree.
 */
const cache = new Map<string, TFunction>()

export async function getT(locale: string): Promise<TFunction> {
    const lng = toLocale(locale)
    const cached = cache.get(lng)
    if (cached) return cached

    const instance = createInstance()
    await instance.init({
        lng,
        fallbackLng: FALLBACK_LNG,
        defaultNS: DEFAULT_NS,
        ns: NAMESPACES as unknown as string[],
        resources,
        interpolation: { escapeValue: false },
    })
    const t = instance.getFixedT(lng)
    cache.set(lng, t)
    return t
}

/** Resolve the request locale (cookie → Accept-Language) and return its `t`. */
export async function getServerT(): Promise<TFunction> {
    const [cookieStore, headerStore] = await Promise.all([cookies(), headers()])
    const locale = resolveInitialLocale({
        cookieValue: cookieStore.get(COOKIE_NAME)?.value,
        acceptLanguage: headerStore.get('accept-language'),
    })
    return getT(locale)
}
