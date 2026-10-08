'use client'

import { Menu } from '@base-ui/react/menu'
import { useTranslation } from '@shared/i18n/use-translation'
import { cn } from '@shared/lib/utils'
import { Icon } from '@shared/ui/icon'
import { type FollowedChannel, isFollowedChannelMuted } from '../api/types'
import {
    MENU_ITEM,
    MENU_ITEM_ACTION,
    MENU_ITEM_DESTRUCTIVE,
    MENU_POPUP,
    MENU_TRIGGER,
} from './channel-menu'

/**
 * A followed space's three actions — legacy's kebab on the `/following` row.
 *
 * Pin / Unpin, Mute / Unmute, Unfollow. All three always present, unlike
 * `ChannelEventMenu`'s conditional Cancel: every one of them is meaningful for every row, and each
 * is its own opposite, so the menu never has a dead item.
 *
 * ## Unfollow is painted destructive; the other two are not
 *
 * Not because it deletes anything of the reader's, but because it is the only one that **changes
 * what they see**: the space leaves the list and its posts leave their feed. Pin and mute are
 * preferences on a follow that survives them. Legacy paints all three identically and the
 * consequence is a menu where the item that removes a space looks exactly like the one that
 * silences it.
 *
 * ## No confirmation, because there is an Undo
 *
 * The other destructive presses in this feature go through `ConfirmDialog` (blocking, cancelling an
 * event, Decline all) and this one does not — deliberately. `useFollowedChannels` holds the unfollow
 * for five seconds and offers to cancel it, so the reversal is *after* the press rather than a
 * question before it. A dialog on top of that would be two gates on one action, and the undo is the
 * better of the two: it costs nothing when the press was intended, which is almost always.
 *
 ## A trailing glyph on every row, the same pairs `ChannelViewerMenu` draws
 *
 * Legacy draws an outlined mark per row (`iconPinOutlined` / `iconUnpinOutlined`,
 * `iconMuteOutlined` / `iconUnmuteOutlined`, `iconUnfollowOutlined`). This menu shipped with labels
 * only for a while, because the sprite had no `thumbtack-slash` and nothing for "stop following" —
 * and a column with a mark on one row of three is worse than none. The 2026-10-08 library import
 * closed both gaps, so every row has its pair again:
 *
 * - **Pin / Unpin** — `thumbtack` / `thumbtack-slash`, at `regular` (legacy's are outlines; the bare
 *   `thumbtack` is the solid one). Legacy's pin is slanted and the DS slash pair is upright; the
 *   pair has to agree with itself before it agrees with legacy.
 * - **Mute / Unmute** — `bell-slash` / `bell`: the state the row moves to, as in
 *   `ChannelViewerMenu`.
 * - **Unfollow** — `heart-slash`, which is legacy's own drawing here, and the space menu's Unfollow.
 *
 * Each glyph is a literal tag, not a name in the table: the sprite subset is found by scanning
 * source, and a name handed to `<Icon>` at runtime ships without the weight it is drawn in.
 */
export function FollowingRowMenu({
    channel,
    disabled = false,
    onTogglePin,
    onToggleMute,
    onUnfollow,
}: {
    channel: FollowedChannel
    /** Some write on this list is in flight — the list is single-flight. */
    disabled?: boolean
    onTogglePin: () => void
    onToggleMute: () => void
    onUnfollow: () => void
}) {
    const { t } = useTranslation()
    const muted = isFollowedChannelMuted(channel)
    const name = channel.name || `@${channel.slug}`

    const items: {
        key: string
        label: string
        glyph: React.ReactNode
        tone: 'action' | 'destructive'
        run: () => void
    }[] = [
        {
            key: 'pin',
            label: t(channel.pin ? 'following_unpin' : 'following_pin'),
            glyph: channel.pin ? (
                <Icon name="thumbtack-slash" size={24} className="flex-none" />
            ) : (
                <Icon name="thumbtack" weight="regular" size={24} className="flex-none" />
            ),
            tone: 'action',
            run: onTogglePin,
        },
        {
            key: 'mute',
            label: t(muted ? 'following_unmute' : 'following_mute'),
            glyph: muted ? (
                <Icon name="bell" size={24} className="flex-none" />
            ) : (
                <Icon name="bell-slash" size={24} className="flex-none" />
            ),
            tone: 'action',
            run: onToggleMute,
        },
        {
            key: 'unfollow',
            label: t('following_unfollow'),
            glyph: <Icon name="heart-slash" size={24} className="flex-none" />,
            tone: 'destructive',
            run: onUnfollow,
        },
    ]

    return (
        <Menu.Root>
            <Menu.Trigger
                /*
                 * The visible trigger is three dots on every row, so the accessible name has to
                 * carry *whose* row it is — a list of twenty is otherwise twenty buttons called
                 * "More". Same rule `FollowRequestRow` applies to its two buttons.
                 */
                aria-label={t('following_row_actions', { name })}
                disabled={disabled}
                className={cn(MENU_TRIGGER, 'disabled:pointer-events-none disabled:opacity-50')}
            >
                <Icon name="more-horizontal" size={20} className="size-5" />
            </Menu.Trigger>
            <Menu.Portal>
                <Menu.Positioner side="bottom" align="end" sideOffset={4} className="z-50">
                    {/* 200, the action-menu width — `channel-menu.tsx` records why the filter's
                        160 and this are two different numbers. */}
                    <Menu.Popup className={cn('min-w-[200px]', MENU_POPUP)}>
                        {items.map(item => (
                            <Menu.Item
                                data-testid="channel-following-menu-item"
                                data-row-key={item.key}
                                key={item.key}
                                className={cn(
                                    MENU_ITEM,
                                    item.tone === 'destructive'
                                        ? MENU_ITEM_DESTRUCTIVE
                                        : MENU_ITEM_ACTION,
                                )}
                                onClick={item.run}
                            >
                                {item.label}
                                {item.glyph}
                            </Menu.Item>
                        ))}
                    </Menu.Popup>
                </Menu.Positioner>
            </Menu.Portal>
        </Menu.Root>
    )
}
