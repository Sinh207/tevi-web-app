'use client'

import { Menu } from '@base-ui/react/menu'
import { ShareDialog } from '@features/share'
import { useTranslation } from '@shared/i18n/use-translation'
import { cn } from '@shared/lib/utils'
import { ConfirmDialog } from '@shared/ui/confirm-dialog'
import { Icon } from '@shared/ui/icon'
import { useState } from 'react'
import { type ChannelEvent, eventShareUrl } from '../api/events-api'
import { useCancelEvent } from '../hooks/use-cancel-event'
import { ChannelEventQrDialog } from './channel-event-qr-dialog'
import {
    MENU_ITEM,
    MENU_ITEM_ACTION,
    MENU_ITEM_DESTRUCTIVE,
    MENU_POPUP,
    MENU_TRIGGER,
} from './channel-menu'

/**
 * An event row's actions — legacy's kebab menu.
 *
 * ## Two items, or three
 *
 * Share and Get QR Code always; **Cancel only when the event is `PUBLISHED`**. That condition is
 * legacy's and it is the right one: cancelling is only meaningful for something scheduled and not
 * yet started. A live, ended or already-cancelled event has nothing to call off, and offering the
 * row anyway would be an action that can only fail.
 *
 * Which is also why this could not be flattened into a button the way "Leave this MCN" was: that
 * menu had exactly one item, this one genuinely has two or three.
 *
 * ## Share opens the sheet now, and the reason it used not to is gone
 *
 * This copied the link to the clipboard, and the argument was about *overlays*: invoking the OS
 * share sheet from an open menu means two of them fighting over focus, and on a desktop
 * `navigator.share` mostly does not exist, so the row would have done nothing on the surface where
 * a creator is most likely to be organising events.
 *
 * `features/share`'s dialog is neither of those things — it is an ordinary popup raised from a menu
 * item, exactly as **Get QR Code** in this same menu already is. So the row opens it, and Copy link
 * survives *inside* it as one of the seven channels, which is where legacy puts it too.
 *
 * ⚠ **No content context.** `spaceShareContext` names a space and there is no builder for a live:
 * legacy has none either (`utils/shareContent.js` builds `post` and `space` only), and this client's
 * event schema carries a `code` and no id — the field `POST v1/links` would need. So an event shares
 * through `v1/shorten/`, one plain link for every channel, and the per-channel attribution that a
 * space share gets is simply not available here. **B97** in `docs/BACKEND_QUESTIONS.md` is where the
 * question sits: if `content_type: 'live'` takes the event **code** as its `content_id`, this becomes
 * one line.
 *
 * ## Every write is guarded, and the destructive one twice
 *
 * Cancel goes through `ConfirmDialog` before it goes through the mutation. It notifies whoever was
 * going to attend, so it is not undoable by pressing the button again.
 */
export function ChannelEventMenu({
    event,
    slug,
    orientation = 'vertical',
}: {
    event: ChannelEvent
    slug: string
    /**
     * The trigger's glyph. `horizontal` where Figma draws the menu in a post-shaped card header (the
     * home Lives card), so it matches the post cards beside it; the event list keeps its kebab.
     */
    orientation?: 'vertical' | 'horizontal'
}) {
    const { t } = useTranslation()
    const [qrOpen, setQrOpen] = useState(false)
    const [shareOpen, setShareOpen] = useState(false)
    const [confirmOpen, setConfirmOpen] = useState(false)
    const cancel = useCancelEvent()

    // No code, no link and nothing to cancel — the menu would be three dead rows.
    if (!event.code) return null

    const url = eventShareUrl(slug, event.code)
    const canCancel = event.status === 'PUBLISHED'

    return (
        <>
            <Menu.Root>
                <Menu.Trigger
                    aria-label={t('channel_event_actions')}
                    /*
                     * `shrink-0` comes with `buttonVariants`, and it matters here: the row is
                     * `items-start`, so without a fixed box the trigger stretches to the height of
                     * the text column beside it and its hover fill becomes a tall stripe.
                     */
                    className={MENU_TRIGGER}
                >
                    <Icon
                        name={orientation === 'horizontal' ? 'more-horizontal' : 'more-vertical'}
                        size={20}
                        className="size-5"
                    />
                </Menu.Trigger>
                <Menu.Portal>
                    <Menu.Positioner side="bottom" align="end" sideOffset={4} className="z-50">
                        {/* 200 wide, against the filter's 160 — legacy's own two numbers. */}
                        <Menu.Popup className={cn('min-w-[200px]', MENU_POPUP)}>
                            <Menu.Item
                                data-testid="channel-event-share"
                                className={cn(MENU_ITEM, MENU_ITEM_ACTION)}
                                onClick={() => setShareOpen(true)}
                            >
                                {t('channel_event_share')}
                                <Icon name="share" size={24} className="flex-none" />
                            </Menu.Item>
                            <Menu.Item
                                data-testid="channel-event-qr"
                                className={cn(MENU_ITEM, MENU_ITEM_ACTION)}
                                onClick={() => setQrOpen(true)}
                            >
                                {t('channel_event_qr')}
                                <Icon name="qr-code" size={24} className="flex-none" />
                            </Menu.Item>
                            {canCancel && (
                                <Menu.Item
                                    data-testid="channel-event-cancel"
                                    className={cn(MENU_ITEM, MENU_ITEM_DESTRUCTIVE)}
                                    onClick={() => setConfirmOpen(true)}
                                >
                                    {t('channel_event_cancel')}
                                    <Icon name="calendar" size={24} className="flex-none" />
                                </Menu.Item>
                            )}
                        </Menu.Popup>
                    </Menu.Positioner>
                </Menu.Portal>
            </Menu.Root>

            <ShareDialog
                open={shareOpen}
                onOpenChange={setShareOpen}
                url={url}
                title={event.title}
                image={event.images.banner}
                /* No context — see the note on this file. An event shares through `v1/shorten/`. */
            />

            <ChannelEventQrDialog event={event} url={url} open={qrOpen} onOpenChange={setQrOpen} />

            <ConfirmDialog
                testId="channel-event-cancel-confirm"
                open={confirmOpen}
                onOpenChange={setConfirmOpen}
                title={t('channel_event_cancel_title')}
                description={t('channel_event_cancel_description')}
                confirmLabel={t('channel_event_cancel_confirm')}
                cancelLabel={t('common_close')}
                /* Same as the block confirm: `ConfirmDialog` leaves the dismissal to its caller,
                   so a confirm that only fires the mutation leaves the dialog sitting there. */
                onConfirm={() => {
                    setConfirmOpen(false)
                    if (event.code) cancel.mutate(event.code)
                }}
                pending={cancel.isPending}
                destructive
            />
        </>
    )
}
