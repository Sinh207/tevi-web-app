import { NONCE_HEADER } from '@shared/config/csp'
import { BASE_URL } from '@shared/config/env'
import { chella, inter } from '@shared/config/fonts'
import { SITE_NAME, siteOpenGraph } from '@shared/config/seo'
import { STARTUP_IMAGES } from '@shared/config/startup-images'
import { readWebviewHeaders } from '@shared/config/webview'
import { getLocaleBundle } from '@shared/i18n/resources'
import {
    COOKIE_NAME,
    htmlDir,
    resolveInitialLocale,
    URL_LOCALE_HEADER,
} from '@shared/i18n/settings'
import type { Metadata, Viewport } from 'next'
import { cookies, headers } from 'next/headers'
import { AppProviders } from './providers'
import './globals.css'

export const metadata: Metadata = {
    title: {
        default: 'Tevi',
        template: '%s · Tevi',
    },
    description: 'Tevi — a monetization platform for content creators.',
    metadataBase: new URL(BASE_URL),
    applicationName: SITE_NAME,
    /*
     * The share card every page inherits until it writes its own — and a page that does write one
     * goes through `siteOpenGraph` too, because Next replaces `openGraph` whole rather than merging
     * it. `twitter` is deliberately absent: Next derives it from this.
     */
    openGraph: siteOpenGraph(),
    // iOS launch images. Android gets its splash from the manifest's `background_color`;
    // iOS ignores that and needs a bitmap per screen size, or it launches to white — see
    // `shared/config/startup-images.ts`. Declaring `appleWebApp` at all also emits
    // `mobile-web-app-capable` (Next writes the standardised name, not Apple's old
    // `apple-` one), which asks for the same standalone launch the manifest's
    // `display: 'standalone'` already does — so the two agree rather than compete.
    appleWebApp: { title: 'Tevi', statusBarStyle: 'default', startupImage: STARTUP_IMAGES },
}

export const viewport: Viewport = {
    themeColor: '#501BC0',
    width: 'device-width',
    initialScale: 1,
    viewportFit: 'cover',
}

/**
 * The document, and nothing that needs an account.
 *
 * `AppProviders` here is the base tree only — QueryClient, theme, i18n — because this layout
 * is shared with `/app/*`, the mobile app's webview screens. The session stack (auth,
 * balance, own channel, dialogs, splash) is mounted one level down, by `(web)/layout.tsx`;
 * see `app/session-providers.tsx` for why a webview must not inherit it.
 */
export default async function RootLayout({ children }: { children: React.ReactNode }) {
    const [cookieStore, headerStore] = await Promise.all([cookies(), headers()])
    // On `/app/*` the mobile app sends its own language and theme on the URL and
    // `proxy.ts` forwards them as headers — see `shared/config/webview.ts`. They win over
    // the browser's own signals, because inside a webview the app *is* the environment.
    const webview = readWebviewHeaders(name => headerStore.get(name))
    const locale =
        webview.locale ??
        resolveInitialLocale({
            urlValue: headerStore.get(URL_LOCALE_HEADER),
            cookieValue: cookieStore.get(COOKIE_NAME)?.value,
            acceptLanguage: headerStore.get('accept-language'),
        })

    // `system` means "let the OS decide", which is already the web default, so only an
    // explicit light/dark is forced. Painting the class here as well as handing it to
    // next-themes is what keeps a dark webview from flashing white on first paint.
    const forcedTheme =
        webview.theme === 'light' || webview.theme === 'dark' ? webview.theme : undefined

    // next-themes renders its own blocking script, which our CSP would otherwise block —
    // see NONCE_HEADER. Absent when the response is not a document the proxy handled.
    const nonce = headerStore.get(NONCE_HEADER) ?? undefined

    return (
        <html
            lang={locale}
            dir={htmlDir(locale)}
            suppressHydrationWarning
            data-webview={webview.isWebview ? '' : undefined}
            className={`${inter.variable} ${chella.variable}${forcedTheme === 'dark' ? ' dark' : ''}`}
        >
            <body className="min-h-[var(--window-height)] antialiased">
                <AppProviders
                    locale={locale}
                    // The request's translations, travelling with the document instead of as a
                    // bundled chunk: the client ships English (the fallback) and nothing else,
                    // so a Vietnamese reader stops downloading Korean. `null` for English.
                    translations={getLocaleBundle(locale)}
                    forcedTheme={forcedTheme}
                    nonce={nonce}
                >
                    {children}
                </AppProviders>
            </body>
        </html>
    )
}
