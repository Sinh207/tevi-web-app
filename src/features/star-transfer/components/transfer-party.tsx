'use client'

import { AnimatedAvatar } from '@shared/components/animated-avatar'
import { useTranslation } from '@shared/i18n/use-translation'
import { cn } from '@shared/lib/utils'
import type { ReactNode } from 'react'
import type { TransferParty as Party } from '../api/types'

/**
 * One end of a transfer: face, name, Tevi ID — and whatever the caller puts on the right.
 *
 * It appears **five** times in this feature (the resolved receiver under the ID field, both parties on
 * the review screen, every row of a bulk list, both parties on the receipt), which is exactly the
 * situation legacy answered by copying an avatar-plus-two-lines block five times — and then drifting:
 * three of its copies truncate the display name and two do not.
 *
 * ## The ID is shown, always, and it is the point
 *
 * A display name is not unique on Tevi and is not what was typed into the field. The ID underneath is
 * how a reader confirms that the person they are about to send Star to is the person they meant, so it
 * is never the thing that gets dropped to save a line — the *name* is, when the payload carried none.
 *
 * ## The avatar never animates
 *
 * `AnimatedAvatar` with `isPremium={false}`, the same call `BlockedAccountRow` makes: a Premium
 * creator's clip looping inside a confirmation dialog spends attention — and battery — on the one
 * screen where the reader should be reading figures. The component is still the right one, because it
 * owns the placeholder and the failed-decode fallback.
 */
export function TransferParty({
    party,
    trailing,
    size = 'medium',
    className,
    testId,
    rowIndex,
}: {
    party: Party
    /** The right-hand side — an amount, a remove button. */
    trailing?: ReactNode
    size?: 'small' | 'medium'
    className?: string
    /**
     * The row's id, passed rather than spread — a closed prop list would drop a `data-testid`.
     * `rowIndex` because a bulk transfer's receivers are a caller-built ordered list.
     */
    testId?: string
    rowIndex?: number
}) {
    const { t } = useTranslation()

    return (
        <div
            data-testid={testId}
            data-index={rowIndex}
            className={cn('flex min-w-0 items-center gap-2', className)}
        >
            <AnimatedAvatar
                thumb={party.avatarUrl}
                isPremium={false}
                alt={party.name || party.id}
                size={size}
            />
            <div className="flex min-w-0 flex-auto flex-col">
                {party.name && (
                    <span className="type-dense-emphasis truncate text-(--text-title)">
                        {party.name}
                    </span>
                )}
                <span className="type-dense-default truncate text-(--text-subtitle)">
                    {t('star_transfer_tevi_id')}: {party.id}
                </span>
            </div>
            {trailing !== undefined && (
                <div className="flex flex-none items-center">{trailing}</div>
            )}
        </div>
    )
}
