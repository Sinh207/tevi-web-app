'use client'

import { useTranslation } from '@shared/i18n/use-translation'
import { Button } from '@shared/ui/button'
import { useEffect } from 'react'

export default function ErrorPage({
    error,
    reset,
}: {
    error: Error & { digest?: string }
    reset: () => void
}) {
    const { t } = useTranslation()

    useEffect(() => {
        // TODO(Bước 10): report to DataDog RUM once tracking is wired.
        console.error(error)
    }, [error])

    return (
        <main className="mx-auto flex min-h-[var(--window-height)] max-w-md flex-col items-center justify-center gap-4 p-6 text-center">
            <h1 className="type-title-t2-semibold">{t('error_title')}</h1>
            <p className="type-dense-default text-text-body">{t('error_description')}</p>
            <Button onClick={reset}>{t('common_retry')}</Button>
        </main>
    )
}
