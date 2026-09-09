'use client'

import { ErrorScreen } from '@shared/components/error-screen'
import { useTranslation } from '@shared/i18n/use-translation'
import { ERROR_ART } from '@shared/lib/error-art'
import { Button } from '@shared/ui/button'
import { useEffect } from 'react'

/**
 * The route-level error boundary — legacy's `pages/500`, and also its `pages/_error`.
 *
 * ## There is no `/500` route here, and there should not be
 *
 * Legacy reaches its 500 page by `router.push('/500')`, from exactly one place
 * (`providers/myChannel`, when `getMyChannel` answers with something it did not expect). That is a
 * Pages Router idiom with no counterpart here: a failed read is TanStack Query's `isError` and is
 * rendered in place, and a render that actually throws is caught by *this* file. Porting the route
 * would add an address nothing navigates to.
 *
 * ## The button reloads, where legacy's goes home
 *
 * Legacy labels it **Reload & Retry** and calls `router.push('/')`, which is neither. `reset()` is
 * what the label has always promised: re-render the segment that threw, keeping the reader where
 * they were. The string is legacy's, so nine locales already say the right thing.
 */
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
        <ErrorScreen
            testId="app-error"
            art={ERROR_ART.failed}
            title={t('error_title')}
            body={<p>{t('error_description')}</p>}
            actions={
                <Button data-testid="app-error-retry" variant="accent" size="large" onClick={reset}>
                    {t('error_reload')}
                </Button>
            }
        />
    )
}
