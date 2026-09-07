'use client'

import {
    ActionMenu,
    ActionMenuContent,
    ActionMenuItem,
    ActionMenuTrigger,
} from '@shared/components/action-menu'
import { useTranslation } from '@shared/i18n/use-translation'
import { Icon } from '@shared/ui/icon'

/**
 * One notification's kebab — legacy's two items, `Mark as read` / `Mark as unread` and `Delete`.
 *
 * ## It wears the app's action-menu skin, not the DS dropdown
 *
 * This was built on `shared/ui/menu.tsx` — the real Figma port (`Dropdown/Menu Item` 107:23573): a
 * 264px panel with a 48px leading icon gutter and no rules. Correct as a port, and wrong as a
 * product decision: **every other kebab in the shipped app** — the `/following` row, the channel
 * event menu, the viewer menu, a saved card — is legacy's narrower text menu, so the inbox was the
 * one screen whose overflow menu was a different object. Consistency across the product beats
 * fidelity to a component the rest of the product does not use yet.
 *
 * `shared/components/action-menu.tsx` is that skin, promoted out of `features/channel` so this
 * feature can reach it without importing another feature's internals. When the DS dropdown is
 * adopted for real, it is that file to change and not this one.
 *
 * ## The glyphs, and the one the sprite does not have
 *
 * Trailing at 20px, which is where this skin's `justify-between` puts them and the size a 14px row
 * calls for — `ActionMenuContent`'s note derives it from the DS's own 24-against-16 ratio. They
 * inherit the row's colour, so Delete's turns red with its label.
 *
 * ⚠ **The sprite has no envelope glyph** — checked: no `envelope`, no `mail`, no `inbox` — and no
 * `eye-slash` either, so the two readings a read/unread pair would normally take are both closed.
 * The pair is drawn from the bell family instead, which is at least the vocabulary this screen is
 * already in: `bell-check` for "mark as read" and `bell-on` for "mark as unread" (an unread
 * notification being a live one). Nothing is hand-drawn and no unrelated shape is pressed into the
 * role — a bare `check` would say "done", which is not the same statement as "read". A standing
 * request to Brand; the day an envelope pair lands, it is two lines here.
 *
 * ## The trigger carries the row's title
 *
 * Twenty rows means twenty buttons, and "More" twenty times is a screen reader reading out a list of
 * identical controls. The title is the only thing that tells them apart; where a notification has
 * none, the label falls back to a generic one rather than rendering an empty pair of quotes.
 *
 * `more-horizontal`, matching `ChannelViewerMenu` and `FollowingRowMenu`. Legacy uses
 * `MoreVertRoundedIcon` on the row and `MoreHorizRoundedIcon` on the page bar — two glyphs for the
 * same affordance one screen apart.
 */
export function NotificationRowMenu({
    read,
    title,
    disabled = false,
    onToggleRead,
    onDelete,
}: {
    /** The row's current state — the first item is its opposite. */
    read: boolean
    /** For the trigger's accessible name. `null` when the service sent no title. */
    title: string | null
    /** A write on this row is in flight, or the list is busy elsewhere. */
    disabled?: boolean
    onToggleRead: () => void
    onDelete: () => void
}) {
    const { t } = useTranslation()

    return (
        <ActionMenu>
            <ActionMenuTrigger
                aria-label={
                    title
                        ? t('notification_row_actions', { title })
                        : t('notification_row_actions_generic')
                }
                disabled={disabled}
            >
                {/* `size-5` as well as `size={20}` — `ActionMenuTrigger`'s note explains why the
                    attribute alone is silently overridden back to 18. */}
                <Icon name="more-horizontal" size={20} className="size-5" />
            </ActionMenuTrigger>
            <ActionMenuContent>
                <ActionMenuItem data-testid="notification-toggle-read" onClick={onToggleRead}>
                    {t(read ? 'notification_mark_unread' : 'notification_mark_read')}
                    <Icon name={read ? 'bell-on' : 'bell-check'} size={20} className="flex-none" />
                </ActionMenuItem>
                {/*
                 * The only destructive row here: the notification goes and this client cannot put it
                 * back. Legacy paints both items identically, so the one that destroys it looks
                 * exactly like the one that dims it.
                 */}
                <ActionMenuItem
                    data-testid="notification-delete"
                    tone="destructive"
                    onClick={onDelete}
                >
                    {t('notification_delete')}
                    {/* No colour of its own: `currentColor` takes the row's `--text-error`. */}
                    <Icon name="trash" size={20} className="flex-none" />
                </ActionMenuItem>
            </ActionMenuContent>
        </ActionMenu>
    )
}
