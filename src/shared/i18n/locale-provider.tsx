'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { I18nextProvider } from 'react-i18next'
import { i18next, initI18nClient } from './client'
import { htmlDir, type TranslationBundle, toLocale } from './settings'

/** Boots the client i18next instance with the server-resolved locale. */
export function LocaleProvider({
    locale,
    bundle,
    children,
}: {
    locale: string
    /**
     * This request's translations, or `null` for English (already in the client bundle as the
     * fallback). Resolved on the server by `getLocaleBundle` and passed down rather than imported,
     * which is what keeps the other eight locales out of the browser — see `client.ts`.
     */
    bundle?: TranslationBundle | null
    children: React.ReactNode
}) {
    // Initialize synchronously on first render so children never see raw keys.
    const [instance] = useState(() => initI18nClient(locale, bundle))
    const router = useRouter()

    useEffect(() => {
        const lng = toLocale(locale)
        if (typeof document !== 'undefined') {
            document.documentElement.lang = lng
            document.documentElement.dir = htmlDir(lng)
        }
    }, [locale])

    /**
     * **The server's half of a language switch.**
     *
     * `i18n.changeLanguage` repaints client components; it cannot touch a string that was rendered
     * on the server. And most of them are: `getServerT()` resolves from the `tevi.locale` cookie in
     * 80 files — whole pages (`terms`, `privacy`, `letter`), every `loading.tsx`, both 404s. The
     * visible symptom was a screen half in each language, or, on an RSC-only screen like
     * `[slug]/not-found.tsx`, a language picker that appeared to do nothing at all until the page
     * was reloaded by hand.
     *
     * `router.refresh()` re-requests the current route's RSC payload with the new cookie, keeping
     * client state and scroll position — so the i18next instance, and the switch that just
     * happened, survive it. `useTranslation` writes the cookie *before* the switch precisely so
     * this fires against the right one.
     *
     * ## Here, and not in `useTranslation`
     *
     * Because that hook is called by hundreds of components and this needs a mounted app router:
     * putting `useRouter()` there made every component that renders a string depend on a router
     * context, which is a real coupling and not only a test-harness one (it broke ten test files at
     * once). This provider is mounted once, always under the router, and is the one place that
     * already knows **which locale the server rendered** — which is the actual condition. So the
     * refresh is asked for only when the client's language has moved *away* from the server's, and
     * a re-render that hands back the same locale (a webview, where the URL decides) settles rather
     * than loops.
     */
    useEffect(() => {
        const served = toLocale(locale)
        const onLanguageChanged = (lng: string) => {
            if (toLocale(lng) !== served) router.refresh()
        }
        instance.on('languageChanged', onLanguageChanged)
        return () => {
            instance.off('languageChanged', onLanguageChanged)
        }
    }, [instance, locale, router])

    return <I18nextProvider i18n={instance}>{children}</I18nextProvider>
}

export { i18next }
