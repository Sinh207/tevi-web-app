'use client'

import { Menu } from '@base-ui/react/menu'
import { useTranslation } from '@shared/i18n/use-translation'
import { cn } from '@shared/lib/utils'
import { ConfirmDialog } from '@shared/ui/confirm-dialog'
import { Icon } from '@shared/ui/icon'
import { useState } from 'react'
import { toast } from 'sonner'
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
 * ## Share copies rather than opening the share sheet
 *
 * Legacy calls `copyText` and so does this — deliberately, not by omission. `navigator.share` is the
 * better affordance on a phone and the channel bar uses it, but here the row sits inside an open
 * menu: invoking the OS sheet from a menu item means two overlays fighting over focus, and on
 * desktop `navigator.share` mostly does not exist, so the row would do nothing on the surface where
 * a creator is most likely to be organising events.
 *
 * ## Every write is guarded, and the destructive one twice
 *
 * Cancel goes through `ConfirmDialog` before it goes through the mutation. It notifies whoever was
 * going to attend, so it is not undoable by pressing the button again.
 */
export function ChannelEventMenu({ event, slug }: { event: ChannelEvent; slug: string }) {
    const { t } = useTranslation()
    const [qrOpen, setQrOpen] = useState(false)
    const [confirmOpen, setConfirmOpen] = useState(false)
    const cancel = useCancelEvent()

    // No code, no link and nothing to cancel — the menu would be three dead rows.
    if (!event.code) return null

    const url = eventShareUrl(slug, event.code)
    const canCancel = event.status === 'PUBLISHED'

    async function share() {
        try {
            await navigator.clipboard.writeText(url)
            toast.success(t('channel_event_link_copied'), { id: 'channel-event-share' })
        } catch {
            // Real, not padding: `navigator.clipboard` is absent on insecure origins and can be
            // refused by permissions policy. Put the URL in the toast so it can be copied by hand.
            toast.error(t('channel_event_link_copy_failed', { url }), { id: 'channel-event-share' })
        }
    }

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
                    <Icon name="more-vertical" size={20} className="size-5" />
                </Menu.Trigger>
                <Menu.Portal>
                    <Menu.Positioner side="bottom" align="end" sideOffset={4} className="z-50">
                        {/* 200 wide, against the filter's 160 — legacy's own two numbers. */}
                        <Menu.Popup className={cn('min-w-[200px]', MENU_POPUP)}>
                            <Menu.Item className={cn(MENU_ITEM, MENU_ITEM_ACTION)} onClick={share}>
                                {t('channel_event_share')}
                                <Icon name="share" size={24} className="flex-none" />
                            </Menu.Item>
                            <Menu.Item
                                className={cn(MENU_ITEM, MENU_ITEM_ACTION)}
                                onClick={() => setQrOpen(true)}
                            >
                                {t('channel_event_qr')}
                                <Icon name="qr-code" size={24} className="flex-none" />
                            </Menu.Item>
                            {canCancel && (
                                <Menu.Item
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

            <ChannelEventQrDialog event={event} url={url} open={qrOpen} onOpenChange={setQrOpen} />

            <ConfirmDialog
                open={confirmOpen}
                onOpenChange={setConfirmOpen}
                title={t('channel_event_cancel_title')}
                description={t('channel_event_cancel_description')}
                confirmLabel={t('channel_event_cancel_confirm')}
                cancelLabel={t('common_close')}
                onConfirm={() => event.code && cancel.mutate(event.code)}
                pending={cancel.isPending}
                destructive
            />
        </>
    )
}
