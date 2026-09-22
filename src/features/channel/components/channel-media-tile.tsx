import { cn } from '@shared/lib/utils'
import { Icon } from '@shared/ui/icon'
import type { ChannelThread } from '../api/types'

/**
 * The card standing in for a real post, until `features/post` lands.
 *
 * ## What this is and is not
 *
 * It is **not** a first draft of the post card. It shows the two fields this feature actually
 * models (`code`, `created_at`) and says out loud that it is a placeholder, so nobody mistakes it
 * for something to build on. Modelling the full post DTO here would put it in the wrong feature and
 * guarantee it drifts from the real one — `features/post` owns that type, and when it arrives this
 * file is deleted rather than refactored.
 *
 * The point of shipping it at all is that everything *around* the card is real: the query, the cursor
 * pagination, the sentinel, the empty state, the error state. Swapping in the real card is one import
 * change, not a new integration.
 */
export function ChannelThreadPlaceholder({ thread }: { thread: ChannelThread }) {
    return (
        <article className="flex min-w-0 items-center gap-3 rounded-[var(--radius-lg)] bg-(--background-surface) p-3 shadow-[inset_0_0_0_0.5px_var(--button-secondary-border)]">
            <span className="flex size-10 flex-none items-center justify-center rounded-[var(--radius-md)] bg-(--background-segment) text-(--icon-secondary)">
                <Icon name="image-gallery" size={20} />
            </span>
            <div className="flex min-w-0 flex-col">
                <p className="type-dense-emphasis truncate text-(--text-title)">
                    {thread.code ?? thread.id}
                </p>
                <p className="type-caption-meta text-(--text-placeholder)">
                    {thread.created_at ?? ''}
                </p>
            </div>
        </article>
    )
}

/**
 * The media grid's tile — three across, square, matching legacy's layout.
 *
 * `21` items per page is why the grid is three-wide: seven complete rows, so the last one is never a
 * ragged tile or two (see `CHANNEL_FIRST_PAGE`).
 */
export function ChannelMediaPlaceholder({ className }: { className?: string }) {
    return (
        <div
            className={cn(
                'flex aspect-square items-center justify-center bg-(--background-segment) text-(--icon-secondary)',
                className,
            )}
        >
            <Icon name="image-gallery" size={24} />
        </div>
    )
}
