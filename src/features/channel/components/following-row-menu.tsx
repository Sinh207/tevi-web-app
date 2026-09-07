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
 ## Labels only — **no trailing glyphs**, and that is the considered answer
 *
 * Legacy draws six 24px images here from `IMAGES_STATIC.icons` (`iconPinOutlined`,
 * `iconMuteOutlined`, `iconUnfollowOutlined`, …) — six network requests for three rows. This menu
 * shipped once with the DS sprite standing in for them, and two of the three marks were not
 * carrying their weight:
 *
 * - **Unfollow.** The sprite has no `user-xmark` — nothing in this design system says "stop
 *   following" — so the row fell back to a plain `xmark`. Generic, and generic is worse than absent
 *   on the one row that is destructive: a bare cross beside red text reads as "close" or "cancel"
 *   rather than as the verb it sits next to.
 * - **Pin / Unpin.** `thumbtack` and `thumbtack-slanted` both exist, but there is no
 *   `thumbtack-slash`, so the pair only reads as pin-versus-*un*pin if you already know that is the
 *   convention being used. It is not one the DS states anywhere; using it would be **this file**
 *   inventing an affordance out of two shapes that merely differ.
 *
 * Only Mute had an exact glyph (`bell-slash`). A menu with a mark on one of three rows and blanks
 * either side is worse than a menu with none, so the column goes rather than going ragged — and the
 * labels are already the whole meaning: three short verbs, one of them in `--text-error`.
 *
 * `MENU_ITEM` keeps its `justify-between`, so the label simply sits at the start. Nothing about the
 * row's geometry is different from `ChannelEventMenu`'s, which **does** keep its glyphs — `share`,
 * `qr-code` and `calendar` are exact for what they label. That is the rule this leaves behind: a
 * glyph earns its place per row, and per menu it is all of them or none.
 *
 * ⚠ Do not "restore" these by reaching for the nearest shape. `heart` reads as un-liking a post,
 * `ban` as blocking the person, `bin` as deleting something of the reader's — all three are wrong in
 * a way that costs more than the blank column. `docs/DESIGN_SYSTEM.md` §3 says it for the whole
 * repo: if the glyph you want does not exist, say so. The day the DS ships `user-xmark` and a
 * pin-slash, this is one line each.
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
        tone: 'action' | 'destructive'
        run: () => void
    }[] = [
        {
            key: 'pin',
            label: t(channel.pin ? 'following_unpin' : 'following_pin'),
            tone: 'action',
            run: onTogglePin,
        },
        {
            key: 'mute',
            label: t(muted ? 'following_unmute' : 'following_mute'),
            tone: 'action',
            run: onToggleMute,
        },
        {
            key: 'unfollow',
            label: t('following_unfollow'),
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
                            </Menu.Item>
                        ))}
                    </Menu.Popup>
                </Menu.Positioner>
            </Menu.Portal>
        </Menu.Root>
    )
}
