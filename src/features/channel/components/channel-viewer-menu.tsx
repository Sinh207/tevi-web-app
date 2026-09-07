'use client'

import { Menu } from '@base-ui/react/menu'
import { useRequireAuth } from '@features/auth'
import { BarIconButton } from '@shared/components/bar-icon-button'
import { useTranslation } from '@shared/i18n/use-translation'
import { cn } from '@shared/lib/utils'
import { ConfirmDialog } from '@shared/ui/confirm-dialog'
import { Icon } from '@shared/ui/icon'
import { useState } from 'react'
import type { Channel } from '../api/types'
import { useChannelActions } from '../hooks/use-channel-actions'
import { MENU_ITEM, MENU_ITEM_ACTION, MENU_ITEM_DESTRUCTIVE, MENU_POPUP } from './channel-menu'
import { ChannelReportDialog } from './channel-report-dialog'

/**
 * The channel bar's overflow menu — legacy's `viewer/topBar/iconBtnMore`.
 *
 * ## The gap this closes
 *
 * Until now this app had **no way to unfollow a space from its own page**: Follow lives in the
 * floating auto-follow bar, and that bar disappears the moment the space is followed. The one
 * affordance legacy puts it behind is this menu, so its absence took Unfollow with it. Mute and
 * Block went the same way.
 *
 * ## Legacy's four rows, in its order, minus one
 *
 * `Mute/Unmute → Follow/Unfollow → Report → Block`, each with its own condition:
 *
 * | row | shown when |
 * |---|---|
 * | Mute | followed, and the space is not unpublished, blocked or suspended |
 * | Follow / Unfollow | not unpublished, not a pending request, and either not blocked or followed |
 * | Report | always (legacy gates it on `channel?.id` alone) |
 * | Block | not unpublished, not already blocked |
 *
 * Report is the widest of the four on purpose: a suspended space, or one that has blocked you, is
 * exactly where somebody may still need to report what they saw.
 *
 * The trigger and popup skins come from `channel-menu.tsx`, the same ones the Live tab's filter and
 * the event row's menu wear, so a fourth menu cannot drift from the other three.
 *
 * ## The rows carry icons, trailing — and legacy's shape does not
 *
 * Its items are a bare `ListItemText`, no glyph on any of the four. Added by request; the
 * arrangement is taken from the **event menu beside this one**, which shares this file's popup skin:
 * label at the start, glyph at the end, `size={24}`, `flex-none`, because `MENU_ITEM` is
 * `justify-between`. Two menus a press apart cannot put their glyphs on different sides.
 *
 * **All four are outline, and that costs Report its flag.** The library draws
 * `flag-swallowtail` in **filled only**, and one solid blob among three hairlines is what a
 * four-row popup looks like when it goes wrong — checked side by side before choosing.
 * `exclamation-circle` is the same stroke weight as the other three and says the same thing.
 * Swap it back the day Figma ships an outline flag.
 *
 * **The Follow row is `heart` / `heart-slash`, and the second half did not exist.** The Figma
 * library draws only the positive half of the pair — as it does for `eye` — so the row had no way to
 * say *unfollow* in the same weight as the `bell` / `bell-slash` row above it. `heart-slash` was
 * taken from **upstream Zappicon v1.2.0** (`heart-simple-slash`, the slash partner of the
 * `heart-simple` the library ships as `heart`) into `design-system/tevi-icons.extra.svg`, which is
 * the sanctioned route CLAUDE.md names for exactly this case: a two-state toggle where one glyph
 * cannot express two states. Read that file's header before adding a fourth entry. Nothing here is
 * hand-drawn or adapted.
 */
export function ChannelViewerMenu({ channel }: { channel: Channel }) {
    const { t } = useTranslation()
    const { follow, unfollow, block, setNotification } = useChannelActions(channel)
    const [confirmBlock, setConfirmBlock] = useState(false)
    const [reportOpen, setReportOpen] = useState(false)
    /*
     * Legacy gates the row itself: `menuItemReport.handleClick` opens the login dialog for an
     * anonymous reader rather than the form. It has to — the reasons endpoint answers **401 "No
     * authentication token provided"**, so an anonymous press would open a form with an empty list
     * and no way to understand why. Measured, not assumed.
     */
    const requireAuth = useRequireAuth()

    const unpublished = channel.privacy === 'unpublished'
    const blocked = channel.blocking_channel
    const followed = channel.is_followed
    const muted = channel.notification_settings?.notification === false

    const showsMute = followed && !unpublished && !blocked && !channel.is_suspended
    const showsFollow = !unpublished && !channel.follow_requested && (!blocked || followed)
    const showsBlock = !unpublished && !blocked
    /*
     * Legacy gates Report on `channel?.id` alone — every space, every state, including the ones
     * where every other row is hidden. That is the point of it: a suspended or blocking space is
     * exactly where somebody may still need to report what they saw.
     */
    const showsReport = Boolean(channel.id)

    // Nothing to offer — a trigger that opens an empty popup is worse than no trigger.
    if (!showsMute && !showsFollow && !showsReport && !showsBlock) return null

    const name = channel.name ?? channel.slug

    return (
        <>
            <Menu.Root>
                {/*
                 * The trigger wears **`BarIconButton`**, the same 40px surface-filled circle the
                 * Share button beside it wears — not the menu shell's own ghost trigger. Two
                 * controls sitting in the same cluster have to look like the same kind of thing;
                 * a ghost square next to a filled circle reads as one of them being broken.
                 *
                 * `render` hands base-ui the element to *be*, so the trigger keeps its ARIA wiring
                 * (`aria-haspopup`, `aria-expanded`, the popup's id) and gains the bar's paint. A
                 * `<Button>` nested inside `Menu.Trigger` would be a button inside a button.
                 *
                 * `more-horizontal` is legacy's glyph (`MoreHorizRoundedIcon`), and it is symmetric,
                 * so it is not mirrored under RTL.
                 */}
                <Menu.Trigger
                    render={
                        <BarIconButton name="more-horizontal" label={t('channel_menu_actions')} />
                    }
                />
                <Menu.Portal>
                    <Menu.Positioner side="bottom" align="end" sideOffset={4} className="z-50">
                        <Menu.Popup className={cn('min-w-[200px]', MENU_POPUP)}>
                            {showsMute && (
                                <Menu.Item
                                    data-testid="channel-notify"
                                    className={cn(MENU_ITEM, MENU_ITEM_ACTION)}
                                    disabled={setNotification.isPending}
                                    /* The value it is moving **to** — muted means notifications off. */
                                    onClick={() => setNotification.run(muted)}
                                >
                                    {muted ? t('channel_action_unmute') : t('channel_action_mute')}
                                    {/* The glyph shows the state the row is **leaving**, matching
                                        its label: a muted space offers "unmute" under a live
                                        bell. */}
                                    <Icon
                                        name={muted ? 'bell' : 'bell-slash'}
                                        size={24}
                                        className="flex-none"
                                    />
                                </Menu.Item>
                            )}
                            {showsFollow && (
                                <Menu.Item
                                    data-testid="channel-menu-follow"
                                    className={cn(MENU_ITEM, MENU_ITEM_ACTION)}
                                    disabled={follow.isPending || unfollow.isPending}
                                    onClick={followed ? unfollow.run : follow.run}
                                >
                                    {followed
                                        ? t('channel_action_unfollow')
                                        : t('channel_action_follow')}
                                    {/* The heart the space page's own Follow control uses, and its
                                        slash — the same "state you are leaving" reading as the bell
                                        above it. */}
                                    <Icon
                                        name={followed ? 'heart-slash' : 'heart'}
                                        size={24}
                                        className="flex-none"
                                    />
                                </Menu.Item>
                            )}
                            {showsReport && (
                                <Menu.Item
                                    data-testid="channel-report"
                                    className={cn(MENU_ITEM, MENU_ITEM_ACTION)}
                                    onClick={requireAuth(() => setReportOpen(true))}
                                >
                                    {t('channel_action_report')}
                                    <Icon
                                        name="exclamation-circle"
                                        size={24}
                                        className="flex-none"
                                    />
                                </Menu.Item>
                            )}
                            {showsBlock && (
                                <Menu.Item
                                    data-testid="channel-block"
                                    className={cn(MENU_ITEM, MENU_ITEM_DESTRUCTIVE)}
                                    /*
                                     * Asks first, as legacy does. Blocking replaces the page with a
                                     * wall and is not something to do on one press of a row that
                                     * sits under the reader's thumb.
                                     */
                                    onClick={() => setConfirmBlock(true)}
                                >
                                    {t('channel_action_block')}
                                    {/* Inherits `MENU_ITEM_DESTRUCTIVE`'s ink through
                                        `currentColor`, so the glyph is red with its label. */}
                                    <Icon name="ban" size={24} className="flex-none" />
                                </Menu.Item>
                            )}
                        </Menu.Popup>
                    </Menu.Positioner>
                </Menu.Portal>
            </Menu.Root>

            <ChannelReportDialog
                channel={channel}
                open={reportOpen}
                onOpenChange={setReportOpen}
                /*
                 * "Report and Block" blocks **after** the report is filed, and it skips the confirm
                 * dialog the menu's own Block row raises: the reader has just chosen this in a form
                 * with the account named in its title, which is the confirmation.
                 */
                onBlock={block.run}
            />

            <ConfirmDialog
                testId="channel-block-confirm"
                open={confirmBlock}
                onOpenChange={setConfirmBlock}
                // Legacy's own title, which names the space **and** its handle: two accounts can
                // share a display name, and blocking the wrong one is not a small mistake.
                title={t('channel_block_confirm_title', { name, slug: channel.slug })}
                // Legacy's own second line (`vs_block_w2_are_you_sure_…`), which its dialog draws
                // under the title. The title names *who*; this asks the question.
                description={t('channel_block_confirm_body')}
                confirmLabel={t('channel_block_confirm_action')}
                /*
                 * **Closes itself.** `ConfirmDialog` does not — its confirm button calls `onConfirm`
                 * and nothing else, so the caller owns the dismissal (the card-management screen
                 * does the same). Without this the request fired and the dialog stayed put, which
                 * reads as a dead button: measured, `POST my-channel/blocks/` went out and the
                 * dialog was still on screen.
                 *
                 * Closing on the press rather than on success, because the block is deliberately
                 * **not optimistic** (see `useChannelActions`): waiting would hold the dialog open
                 * over a page that is about to become a wall anyway, and a failure raises its own
                 * toast.
                 */
                onConfirm={() => {
                    setConfirmBlock(false)
                    block.run()
                }}
                pending={block.isPending}
                destructive
            />
        </>
    )
}
