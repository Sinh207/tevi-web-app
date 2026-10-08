'use client'

import { type Channel, toChannelPath, useChannelActions } from '@features/channel'
import {
    ActionMenu,
    ActionMenuContent,
    ActionMenuItem,
    ActionMenuTrigger,
} from '@shared/components/action-menu'
import { useTranslation } from '@shared/i18n/use-translation'
import { cn } from '@shared/lib/utils'
import { ConfirmDialog } from '@shared/ui/confirm-dialog'
import { Icon } from '@shared/ui/icon'
import Link from 'next/link'
import { useState } from 'react'
import type { Conversation } from '../api/types'
import { useRoomMute } from '../hooks/use-room-mute'
import { DISC } from '../lib/disc'

/**
 * The conversation's own menu, in its header — Android's (`popup_more_chat.xml`): Mute, Block,
 * Delete, with legacy's Space detail on top as its list row has it. Neither app has Report or Clear
 * history here, so neither does this.
 *
 * - **Block is confirmed** and goes through the space's own `useChannelActions`, so the space page,
 *   the room and the wall agree the moment it lands (the room's query is keyed on
 *   `blocking_channel`). Android's Block row shows a loader and sends nothing.
 * - **Unblock** is the same action the i-blocked wall offers, so the menu does not disagree with the
 *   wall under it.
 * - **Delete** is the room's — it owns the confirmation and the way back to the list.
 */
export function ChatRoomMenu({
    channel,
    conversation,
    name,
    onDelete,
}: {
    channel: Channel
    conversation: Conversation
    /** Who the toasts and the confirmation name. */
    name: string
    onDelete: () => void
}) {
    const { t } = useTranslation()
    const mute = useRoomMute(conversation, name)
    const actions = useChannelActions(channel)
    const [confirmingBlock, setConfirmingBlock] = useState(false)
    const blocked = channel.blocking_channel

    return (
        <>
            <ActionMenu>
                <ActionMenuTrigger
                    data-testid="message-room-menu-trigger"
                    aria-label={t('message_room_actions', { name })}
                    className={cn(DISC, 'size-10 flex-none')}
                >
                    <Icon name="more-horizontal" size={24} className="size-6" />
                </ActionMenuTrigger>
                <ActionMenuContent align="end" className="w-[250px]">
                    <ActionMenuItem
                        data-testid="message-room-menu-space"
                        render={<Link href={toChannelPath(channel.slug)} />}
                    >
                        {t('message_space_detail')}
                        <Icon name="user-simple-alt" size={24} className="size-6 flex-none" />
                    </ActionMenuItem>
                    <ActionMenuItem
                        data-testid="message-room-menu-mute"
                        disabled={mute.isPending}
                        onClick={mute.toggle}
                    >
                        {t(mute.muted ? 'message_unmute' : 'message_mute')}
                        <Icon
                            name={mute.muted ? 'volume' : 'volume-off-slash'}
                            size={24}
                            className="size-6 flex-none"
                        />
                    </ActionMenuItem>
                    <ActionMenuItem
                        data-testid="message-room-menu-block"
                        disabled={actions.block.isPending || actions.unblock.isPending}
                        onClick={() => (blocked ? actions.unblock.run() : setConfirmingBlock(true))}
                    >
                        {t(blocked ? 'message_wall_unblock' : 'message_block')}
                        <Icon name="ban" size={24} className="size-6 flex-none" />
                    </ActionMenuItem>
                    <ActionMenuItem
                        data-testid="message-room-menu-delete"
                        tone="destructive"
                        onClick={onDelete}
                    >
                        {t('message_delete')}
                    </ActionMenuItem>
                </ActionMenuContent>
            </ActionMenu>

            <ConfirmDialog
                testId="message-block-confirm"
                open={confirmingBlock}
                onOpenChange={setConfirmingBlock}
                title={t('message_confirm_block_title', { name })}
                description={t('message_confirm_block_body', { name })}
                confirmLabel={t('message_block')}
                destructive
                onConfirm={() => {
                    setConfirmingBlock(false)
                    actions.block.run()
                }}
            />
        </>
    )
}
