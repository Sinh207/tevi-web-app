'use client'

import { AuthProvider } from '@features/auth'
import { LocaleProvider } from '@shared/i18n/locale-provider'
import { makeQueryClient } from '@shared/lib/api/query-client'
import { QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { ThemeProvider } from 'next-themes'
import { useState } from 'react'
import { Toaster } from 'sonner'

/**
 * Root client provider composition (outer → inner):
 *   QueryClient → Theme → Locale(i18n) → Auth → children
 * (Tracking provider slots in here in a later step.)
 */
export function AppProviders({ children, locale }: { children: React.ReactNode; locale: string }) {
    const [queryClient] = useState(makeQueryClient)

    return (
        <QueryClientProvider client={queryClient}>
            <ThemeProvider
                attribute="class"
                defaultTheme="system"
                enableSystem
                themes={['light', 'dark']}
                storageKey="tevi.theme"
            >
                <LocaleProvider locale={locale}>
                    <AuthProvider>{children}</AuthProvider>
                </LocaleProvider>
                <Toaster position="top-center" richColors />
            </ThemeProvider>
            {process.env.NODE_ENV === 'development' && <ReactQueryDevtools initialIsOpen={false} />}
        </QueryClientProvider>
    )
}
