import { chella, inter } from '@shared/config/fonts'
import { COOKIE_NAME, htmlDir, resolveInitialLocale } from '@shared/i18n/settings'
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
    metadataBase: new URL(process.env.NEXT_PUBLIC_BASE_URL ?? 'https://tevi.com'),
}

export const viewport: Viewport = {
    themeColor: '#501BC0',
    width: 'device-width',
    initialScale: 1,
    viewportFit: 'cover',
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
    const [cookieStore, headerStore] = await Promise.all([cookies(), headers()])
    const locale = resolveInitialLocale({
        cookieValue: cookieStore.get(COOKIE_NAME)?.value,
        acceptLanguage: headerStore.get('accept-language'),
    })

    return (
        <html
            lang={locale}
            dir={htmlDir(locale)}
            suppressHydrationWarning
            className={`${inter.variable} ${chella.variable}`}
        >
            <body className="min-h-[var(--window-height)] antialiased">
                <AppProviders locale={locale}>{children}</AppProviders>
            </body>
        </html>
    )
}
