import { useTranslation } from '@shared/i18n/use-translation'
import { Icon } from '@shared/ui/icon'
import { EVENT_HOST_GRADIENT } from '../lib/studio'

/**
 * **Host**, in legacy's gold — a 20px chip, a solid crown and the word, placed **right after** a
 * name. One component for the recipient picker and the seat card, so the mark is drawn once.
 */
export function EventHostBadge() {
    const { t } = useTranslation()
    return (
        <span
            className="type-micro-overline flex h-5 flex-none items-center gap-0.5 rounded-md ps-1 pe-1.5 text-white"
            style={{ background: EVENT_HOST_GRADIENT }}
        >
            <Icon name="crown" weight="filled" size={16} className="size-3" />
            {t('event_gift_recipient_host')}
        </span>
    )
}
