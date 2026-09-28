'use client'

import { useAuth, useRequireAuth } from '@features/auth'
import { ChannelEmptyState, useChannel, useMyChannel } from '@features/channel'
import { useTranslation } from '@shared/i18n/use-translation'
import { safeExternalUrl } from '@shared/lib/safe-url'
import { cn } from '@shared/lib/utils'
import { Button } from '@shared/ui/button'
import { ConfirmDialog } from '@shared/ui/confirm-dialog'
import { Skeleton } from '@shared/ui/skeleton'
import { useQueryClient } from '@tanstack/react-query'
import { type ReactNode, useCallback, useState } from 'react'
import { toast } from 'sonner'
import { forgetConversationCache, messageApi } from '../api/message-api'
import type { ChatMessage, InlineMenuItem } from '../api/types'
import { useChatActions } from '../hooks/use-chat-actions'
import { useComposer, WAVE } from '../hooks/use-composer'
import { useRoom } from '../hooks/use-room'
import { useThread } from '../hooks/use-thread'
import { ONLINE_WINDOW_MS } from '../lib/conversation-view'
import { isOwnMessage, messageText } from '../lib/message-thread'
import { ChatHeader } from './chat-header'
import { ChannelIntro, ChatWall, type ChatWallKind } from './chat-walls'
import { MessageComposer } from './message-composer'
import { MessageThreadView } from './message-thread-view'

/**
 * `/@{slug}/messages` — one conversation. Legacy's `common/chat` with `useChatRoom` and
 * `useActionChat` (1,340 lines of hook between them).
 *
 * ## Which screen, decided in one place
 *
 * Legacy derives the same answer from six booleans spread across two hooks (`showInfo`,
 * `isShowInput`, `isFirstMessage`, …) and gets one case wrong: a conversation with messages whose
 * *recipient* has since been deactivated shows both the thread and the composer, and the send fails.
 * Here `wallFor` is the whole decision and the composer is drawn only when it returns nothing.
 */
export function ChatRoom({ slug }: { slug: string }) {
    const { t, currentLanguage } = useTranslation()
    const { isAuthenticated, isBootstrapping, activeId } = useAuth()
    const requireAuth = useRequireAuth()
    const queryClient = useQueryClient()
    const { myChannel } = useMyChannel()

    const { channel, isLoading: channelLoading, isError: channelError, refetch } = useChannel(slug)
    const own = !!myChannel?.slug && myChannel.slug.toLowerCase() === slug.toLowerCase()
    const room = useRoom(own || channel?.is_suspended ? null : channel)
    const conversation = room.result?.kind === 'open' ? room.result.conversation : null
    const thread = useThread(conversation)
    const chatActions = useChatActions()

    const refreshList = useCallback(async () => {
        await forgetConversationCache(activeId)
        queryClient.invalidateQueries({ queryKey: ['message', 'conversations'] })
    }, [activeId, queryClient])

    const composer = useComposer({
        conversationId: conversation?.id ?? '',
        onMessage: thread.put,
        onDropped: thread.drop,
        onChanged: refreshList,
    })

    const [confirming, setConfirming] = useState<{ message: ChatMessage; both: boolean } | null>(
        null,
    )

    const myAlias = conversation?.me?.tevi_user_alias || null
    const mySlug = myChannel?.slug ?? null
    const isOwn = useCallback(
        (message: ChatMessage) => isOwnMessage(message, { alias: myAlias, slug: mySlug }),
        [myAlias, mySlug],
    )

    const onCopy = useCallback(
        (message: ChatMessage) => {
            const text = messageText(message)
            if (!text) return
            navigator.clipboard
                ?.writeText(text)
                .then(() => toast.success(t('message_copied'), { id: 'message-copy' }))
                .catch(() => toast.error(t('message_copy_failed'), { id: 'message-copy' }))
        },
        [t],
    )

    /** A bot button: open a link, answer the bot, or show its note — legacy's three actions. */
    const onInline = useCallback(
        (message: ChatMessage, item: InlineMenuItem) => {
            if (!item.target) return
            if (item.action === 'OPEN_URL') {
                const href = safeExternalUrl(item.target)
                if (href) window.open(href, '_blank', 'noopener,noreferrer')
            } else if (item.action === 'CALLBACK_DATA') {
                messageApi
                    .setCallbackData(message.id, item.target, activeId)
                    .catch(() => toast.error(t('message_error_generic'), { id: 'message-inline' }))
            } else if (item.action === 'SHOW_INFO_TOAST') {
                toast.info(item.target, { id: 'message-inline' })
            }
        },
        [activeId, t],
    )

    /* ---------------------------------------------------------------- the decision */

    const recipient = conversation?.recipient ?? null
    const online =
        !!recipient?.last_online_at && Date.now() - recipient.last_online_at <= ONLINE_WINDOW_MS

    let wall: ChatWallKind | null = null
    if (channel?.is_suspended || (conversation && recipient && !recipient.active)) wall = 'inactive'
    else if (room.result?.kind === 'gated') wall = room.result.gate
    else if (conversation?.recipient?.blocking) wall = 'blocked-me'
    else if (conversation?.me?.blocking) wall = 'i-blocked'
    else if (
        conversation &&
        !thread.isLoading &&
        !thread.isError &&
        thread.messages.length === 0 &&
        composer.pending.length === 0
    ) {
        wall = 'first'
    }

    const header = (
        <ChatHeader
            channel={channel ?? null}
            slug={slug}
            online={online}
            chatAction={conversation ? chatActions.get(conversation.id) : undefined}
        />
    )

    const shell = (body: ReactNode) => (
        <RoomFrame>
            {header}
            <div className="flex min-h-0 flex-1 flex-col bg-(--background)">{body}</div>
        </RoomFrame>
    )

    if (isBootstrapping || channelLoading) return shell(<ThreadSkeleton />)

    if (!isAuthenticated) {
        return shell(
            <ChannelEmptyState
                testId="message-room-signed-out"
                className="flex-1"
                icon="comment-dots"
                title={t('message_signed_out_title')}
                body={t('message_room_signed_out_body')}
                action={
                    <Button
                        data-testid="message-room-sign-in"
                        variant="primary"
                        size="large"
                        onClick={requireAuth(() => undefined)}
                    >
                        {t('auth_sign_in')}
                    </Button>
                }
            />,
        )
    }

    if (channelError || !channel) {
        return shell(
            <ChannelEmptyState
                testId="message-room-missing"
                className="flex-1"
                icon={channelError ? 'exclamation-diamond' : 'comment-slash'}
                tone={channelError ? 'error' : 'default'}
                title={t(channelError ? 'message_error_title' : 'message_room_missing_title')}
                body={t(channelError ? 'message_error_body' : 'message_room_missing_body')}
                action={
                    channelError ? (
                        <Button variant="secondary" size="large" onClick={() => refetch()}>
                            {t('common_retry')}
                        </Button>
                    ) : undefined
                }
            />,
        )
    }

    if (own) {
        return shell(
            <div className="flex flex-1 flex-col items-center">
                <ChannelIntro channel={channel} />
                <p className="px-6 text-center type-dense-default text-(--text-body)">
                    {t('message_room_self')}
                </p>
            </div>,
        )
    }

    if (room.isLoading && !wall) return shell(<ThreadSkeleton />)

    if (room.isError) {
        return shell(
            <ChannelEmptyState
                testId="message-room-error"
                className="flex-1"
                icon="exclamation-diamond"
                tone="error"
                title={t('message_error_title')}
                body={t('message_error_body')}
                action={
                    <Button variant="secondary" size="large" onClick={room.refetch}>
                        {t('common_retry')}
                    </Button>
                }
            />,
        )
    }

    const blockedWall = wall && wall !== 'first' ? <ChatWall kind={wall} channel={channel} /> : null

    return (
        <RoomFrame>
            {header}
            {conversation && thread.isLoading ? (
                <div className="flex min-h-0 flex-1 flex-col bg-(--background)">
                    <ThreadSkeleton />
                </div>
            ) : conversation && thread.isError ? (
                <div className="flex flex-1 flex-col bg-(--background)">
                    <ChannelEmptyState
                        testId="message-thread-error"
                        className="flex-1"
                        icon="exclamation-diamond"
                        tone="error"
                        title={t('message_error_title')}
                        body={t('message_error_body')}
                        action={
                            <Button variant="secondary" size="large" onClick={thread.refetch}>
                                {t('common_retry')}
                            </Button>
                        }
                    />
                </div>
            ) : (
                <MessageThreadView
                    channel={channel}
                    messages={thread.messages}
                    pending={composer.pending}
                    isOwn={isOwn}
                    hasOlder={thread.hasOlder}
                    isFetchingOlder={thread.isFetchingOlder}
                    loadOlder={thread.loadOlder}
                    locale={currentLanguage}
                    footer={
                        wall === 'first' ? (
                            <ChatWall
                                kind="first"
                                channel={channel}
                                onWave={() => composer.sendText(WAVE)}
                            />
                        ) : (
                            blockedWall
                        )
                    }
                    onReply={composer.startReply}
                    onEdit={composer.startEdit}
                    onDelete={(message, both) => setConfirming({ message, both })}
                    onCopy={onCopy}
                    onInline={onInline}
                    onRetry={composer.retry}
                    onDiscard={composer.discard}
                />
            )}

            {conversation && !wall && <MessageComposer composer={composer} />}

            {/*
             * Both deletes are confirmed, as legacy's are: "for everyone" cannot be undone and
             * reaches the other person's screen; "for me" cannot be undone either.
             */}
            <ConfirmDialog
                testId="message-delete-message-confirm"
                open={confirming !== null}
                onOpenChange={open => {
                    if (!open) setConfirming(null)
                }}
                title={t('message_confirm_delete_message_title')}
                description={t(
                    confirming?.both
                        ? 'message_confirm_delete_everyone_body'
                        : 'message_confirm_delete_me_body',
                )}
                confirmLabel={t('message_delete')}
                destructive
                onConfirm={() => {
                    if (confirming) composer.remove(confirming.message, confirming.both)
                    setConfirming(null)
                }}
            />
        </RoomFrame>
    )
}

/** The room's outer box — one element, whichever state it is in. */
function RoomFrame({ children }: { children: ReactNode }) {
    return (
        <div data-testid="message-room" className="flex min-h-0 flex-1 flex-col">
            {children}
        </div>
    )
}

/** Alternating bubbles, bottom-anchored like the thread they stand in for. */
function ThreadSkeleton() {
    const rows: { own: boolean; w: number }[] = [
        { own: false, w: 180 },
        { own: true, w: 220 },
        { own: false, w: 140 },
        { own: true, w: 160 },
        { own: false, w: 240 },
    ]
    return (
        <div
            data-testid="message-thread-loading"
            aria-busy="true"
            className="mx-auto flex w-full max-w-[640px] flex-1 flex-col justify-end gap-2 px-3 py-3"
        >
            {rows.map((row, index) => (
                <div
                    key={`${row.own}-${row.w}`}
                    className={cn('flex', row.own ? 'justify-end' : 'justify-start')}
                >
                    <Skeleton
                        w={row.w}
                        h={44}
                        delay={index * 160}
                        className="rounded-(--radius-lg)"
                    />
                </div>
            ))}
        </div>
    )
}
