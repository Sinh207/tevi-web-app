'use client'

import { toChannelPath } from '@features/channel'
import {
    ActionMenu,
    ActionMenuContent,
    ActionMenuItem,
    ActionMenuTrigger,
} from '@shared/components/action-menu'
import { useTranslation } from '@shared/i18n/use-translation'
import { Icon } from '@shared/ui/icon'
import Link from 'next/link'

/**
 * One conversation's overflow menu — legacy's two live items, **Space detail** and **Delete**.
 *
 * Legacy has five more item components in the folder (block, clear message, mute, pin, report) and
 * renders none of them; Mute is commented out at the call site. They are not ported as dead code:
 * each needs a write this client has not made yet, and they belong to the chat room's own menu,
 * which is where the apps put them.
 *
 * Space detail is a **link**, not an item that calls `router.push` as legacy's does: middle-click
 * and copy-link work, and there is nothing to spin while it navigates. It is absent for an inactive
 * account, which has no space to go to.
 *
 * `more-horizontal`, matching every other row kebab in the app. The trigger carries the display
 * name — twenty rows of "More options" is twenty identical controls to a screen reader.
 */
export function ConversationRowMenu({
    name,
    slug,
    disabled = false,
    onDelete,
}: {
    name: string
    slug: string | null
    disabled?: boolean
    onDelete: () => void
}) {
    const { t } = useTranslation()

    return (
        <ActionMenu>
            <ActionMenuTrigger
                data-testid="message-row-menu-trigger"
                aria-label={t('message_row_actions', { name })}
                disabled={disabled}
            >
                {/* `size-5` as well as `size={20}` — `ActionMenuTrigger`'s note explains why the
                    attribute alone is overridden back to 18. */}
                <Icon name="more-horizontal" size={20} className="size-5" />
            </ActionMenuTrigger>
            <ActionMenuContent>
                {slug && (
                    <ActionMenuItem
                        data-testid="message-row-menu-space"
                        render={<Link href={toChannelPath(slug)} />}
                    >
                        {t('message_space_detail')}
                        <Icon name="user-simple-alt" size={20} className="flex-none" />
                    </ActionMenuItem>
                )}
                <ActionMenuItem
                    data-testid="message-row-menu-delete"
                    tone="destructive"
                    onClick={onDelete}
                >
                    {t('message_delete')}
                    <Icon name="trash" size={20} className="flex-none" />
                </ActionMenuItem>
            </ActionMenuContent>
        </ActionMenu>
    )
}
