'use client'

import { useEffect, useState } from 'react'
import { I18nextProvider } from 'react-i18next'
import { i18next, initI18nClient } from './client'
import { htmlDir, toLocale } from './settings'

/** Boots the client i18next instance with the server-resolved locale. */
export function LocaleProvider({
    locale,
    children,
}: {
    locale: string
    children: React.ReactNode
}) {
    // Initialize synchronously on first render so children never see raw keys.
    const [instance] = useState(() => initI18nClient(locale))

    useEffect(() => {
        const lng = toLocale(locale)
        if (typeof document !== 'undefined') {
            document.documentElement.lang = lng
            document.documentElement.dir = htmlDir(lng)
        }
    }, [locale])

    return <I18nextProvider i18n={instance}>{children}</I18nextProvider>
}

export { i18next }
