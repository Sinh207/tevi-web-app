'use client'

import { useTranslation } from '@shared/i18n/use-translation'
import { cn } from '@shared/lib/utils'
import { Icon } from '@shared/ui/icon'
import { useEnterTransition } from '../hooks/use-enter-transition'

/**
 * What the player collapses to: a pill in the corner naming the app in front, with a count of the
 * rest.
 *
 * It exists because a mini app is *running*. Closing the player kills the frame — a game mid-round,
 * a call, an upload — so "get this out of my way" and "stop this" have to be two different
 * controls, and this is the first one. Legacy has the same pill for the same reason.
 *
 * Bottom-**end** rather than bottom-right so it follows the writing direction, and above the mobile
 * tab bar's height so it does not sit on top of it.
 *
 * ⚠ In development it lands under the React Query devtools' open button, which is `fixed` in the
 * same corner. Nothing sits there in production, so the placement is left correct for the shipped
 * app rather than nudged around a dev tool.
 */
export function MiniAppMinimizedPill({
    name,
    hiddenCount,
    onRestore,
    onClose,
}: {
    name: string
    /** Tabs other than the one named. `0` hides the counter rather than printing `(+0)`. */
    hiddenCount: number
    onRestore: () => void
    onClose: () => void
}) {
    const { t } = useTranslation()
    const { entered, reducedMotion } = useEnterTransition()

    return (
        <div
            className={cn(
                'fixed bottom-20 end-4 z-40 flex items-center gap-1 rounded-full bg-(--background-elevated) p-1 shadow-2xl sm:bottom-4',
                // Rises from the corner it collapsed into, rather than appearing where the window
                // was. `origin-*` is logical, so it follows the writing direction with the pill.
                !reducedMotion &&
                    'origin-bottom-right transition-[opacity,scale] duration-200 ease-out rtl:origin-bottom-left',
                entered ? 'scale-100 opacity-100' : 'scale-90 opacity-0',
            )}
        >
            <button
                data-testid="mini-app-pill-restore"
                type="button"
                onClick={onRestore}
                className="type-dense-strong flex max-w-50 items-center gap-2 rounded-full px-3 py-1.5 text-(--text-title) hover:bg-(--background-disabled)"
            >
                <Icon
                    name="grid-category"
                    size={16}
                    className="size-4 flex-none text-(--icon-secondary)"
                />
                <span className="min-w-0 truncate">{name}</span>
                {hiddenCount > 0 && (
                    <span className="type-caption-meta flex-none text-(--text-body)">
                        +{hiddenCount}
                    </span>
                )}
            </button>
            {/*
             * Close is *on* the pill and not only inside the restored window: a reader who
             * minimised the player and moved on should be able to be rid of it without bringing a
             * full-screen application back to press one button.
             */}
            <button
                data-testid="mini-app-pill-close"
                type="button"
                onClick={onClose}
                aria-label={t('miniapp_close_player')}
                className="flex size-7 flex-none items-center justify-center rounded-full text-(--icon-secondary) hover:bg-(--background-disabled) hover:text-(--text-title)"
            >
                <Icon name="xmark" size={16} className="size-4" />
            </button>
        </div>
    )
}
