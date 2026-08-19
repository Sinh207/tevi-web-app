'use client'

import { LocaleProvider } from '@shared/i18n/locale-provider'
import type { TranslationBundle } from '@shared/i18n/settings'
import { makeQueryClient } from '@shared/lib/api/query-client'
import { STORAGE_KEYS } from '@shared/lib/storage'
import { Toaster } from '@shared/ui/toaster'
import { QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { ThemeProvider } from 'next-themes'
import { useState } from 'react'

/**
 * Providers every **document** needs, session or not:
 *
 *   QueryClient → Theme → Locale(i18n) → children   (+ Sonner `Toaster`)
 *
 * Mounted in the root layout, so it is the one tree `/app/*` webviews share with the
 * website. Nothing in here talks to the API or reads an account: a `QueryClient` is an
 * empty cache until something queries, and Theme/Locale are what keep the *first paint*
 * correct — which a webview needs more than the website does, since the app dictates both
 * on the URL.
 *
 * **The session stack is deliberately not here** — see `app/session-providers.tsx`. It
 * used to be, which meant opening `/app/privacy` (a static legal page inside the mobile
 * app, where the native side already owns the session) still ran the whole auth
 * bootstrap: a device fingerprint, `/me`, or a Firebase anonymous sign-in plus
 * `v1/connect/anonymous` — three round trips and a Firebase chunk for a page that reads
 * no account at all. `(web)/layout.tsx` mounts it for the website; a webview screen that
 * genuinely needs a session mounts it in its own sub-layout.
 */
export function AppProviders({
    children,
    locale,
    translations,
    forcedTheme,
    nonce,
}: {
    children: React.ReactNode
    locale: string
    /**
     * This request's translations, or `null` for English. Resolved on the server so the client
     * bundle can carry English alone — see `shared/i18n/client.ts`.
     */
    translations?: TranslationBundle | null
    /**
     * Set only for `/app/*` webviews, where the mobile app dictates the theme
     * (`?theme=dark`). It also disables the in-page toggle, which is correct there —
     * the app's own settings screen owns that choice, not this document.
     */
    forcedTheme?: 'light' | 'dark'
    /**
     * This request's CSP nonce. next-themes emits a blocking inline script to set the
     * theme class before first paint; unlike Next's own tags nothing stamps it for us, so
     * without this the CSP blocks it and dark mode flashes white on every load.
     */
    nonce?: string
}) {
    const [queryClient] = useState(makeQueryClient)

    return (
        <QueryClientProvider client={queryClient}>
            <ThemeProvider
                attribute="class"
                defaultTheme="system"
                enableSystem
                themes={['light', 'dark']}
                storageKey={STORAGE_KEYS.theme}
                forcedTheme={forcedTheme}
                nonce={nonce}
            >
                <LocaleProvider locale={locale} bundle={translations}>
                    {children}
                </LocaleProvider>
                {/* Sonner defaults to `theme="light"`, which paints a white toast on a
                    dark page. `system` hands it the same signal next-themes is using,
                    and `forcedTheme` wins inside a webview for the same reason it wins
                    on the document.

                    `richColors` is gone: `shared/ui/toaster.tsx` tints each status from
                    this app's own accent tokens, and the two together would be sonner's
                    palette painted over Tevi's.

                    Base rather than session-level: `query-client.ts` raises error toasts
                    via `meta.showErrorToast`, and a query can be fired from a webview
                    screen that mounts no session at all. */}
                <Toaster position="top-center" theme={forcedTheme ?? 'system'} />
            </ThemeProvider>
            {process.env.NODE_ENV === 'development' && <ReactQueryDevtools initialIsOpen={false} />}
        </QueryClientProvider>
    )
}
