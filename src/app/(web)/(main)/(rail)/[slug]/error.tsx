'use client'

import { useTranslation } from '@shared/i18n/use-translation'
import { Button } from '@shared/ui/button'
import { Icon } from '@shared/ui/icon'

/**
 * Last-resort boundary for the channel route.
 *
 * Deliberately spare, because it should almost never be reached: an upstream failure is already
 * handled as data (`ChannelFetch`) and rendered by `ChannelError` *inside* the page, with the shell
 * intact. Getting here means something threw that the feature did not model — a render error, a bad
 * assumption in a component — so the only honest offer is `reset()`.
 *
 * The root `app/error.tsx` would otherwise catch it and replace the whole shell; this keeps the
 * failure scoped to the route.
 */
export default function ChannelRouteError({ reset }: { error: Error; reset: () => void }) {
    const { t } = useTranslation()

    return (
        <main className="flex flex-1 flex-col items-center justify-center gap-4 px-4 py-10 text-center md:px-6 md:py-16">
            <Icon
                name="exclamation-triangle"
                weight="filled"
                size={32}
                className="text-(--accents-error-active)"
            />
            <div className="flex max-w-[420px] flex-col gap-1">
                <p className="type-body-emphasis text-(--text-title)">{t('channel_error_title')}</p>
                <p className="type-dense-default text-(--text-subtitle)">
                    {t('channel_error_body')}
                </p>
            </div>
            <Button
                data-testid="channel-error-retry"
                variant="secondary"
                size="large"
                onClick={reset}
            >
                <Icon name="arrow-rotate-right" size={20} />
                {t('common_retry')}
            </Button>
        </main>
    )
}
