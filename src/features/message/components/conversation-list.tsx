'use client'

import { useInView } from '@shared/hooks/use-in-view'
import { useTranslation } from '@shared/i18n/use-translation'
import { Loader } from '@shared/ui/loader'
import { type ReactNode, useEffect } from 'react'
import type { ChatAction, Conversation } from '../api/types'
import { toConversationView } from '../lib/conversation-view'
import { ConversationRow } from './conversation-row'
import { ConversationSkeleton } from './conversation-skeleton'

/**
 * One list of conversations with its states — used for each folder and for search results, which
 * differ only in where the rows come from and what "empty" says.
 *
 * The four states are the caller's to phrase and this component's to order: loading, then error,
 * then empty, then rows. Legacy has two of them — its `catch` sets the list to `[]` and raises a
 * toast, so a 502 shows "Welcome to your chat!" under a "Get conversations failed!" banner.
 */
export function ConversationList({
    conversations,
    isLoading,
    isError,
    isEmpty,
    error,
    empty,
    hasNextPage = false,
    isFetchingNextPage = false,
    loadMore,
    chatActions,
    deletingId,
    locale,
    now,
    onOpen,
    onDelete,
    selectedSlug,
    testId,
}: {
    conversations: Conversation[]
    isLoading: boolean
    isError: boolean
    isEmpty: boolean
    error: ReactNode
    empty: ReactNode
    hasNextPage?: boolean
    isFetchingNextPage?: boolean
    loadMore?: () => void
    chatActions: ReadonlyMap<string, ChatAction>
    deletingId: string | null
    locale: string
    now: number
    onOpen: (conversation: Conversation) => void
    onDelete: (conversation: Conversation) => void
    /** The conversation open beside the list — its row is marked current. */
    selectedSlug?: string
    testId: string
}) {
    const { t } = useTranslation()

    /*
     * `enabled` detaches the observer while a page is in flight and once there is nothing left —
     * without it `inView` stays true for the whole request and re-fires the moment it lands.
     */
    const [sentinelRef, sentinelInView] = useInView<HTMLDivElement>({
        enabled: hasNextPage && !isFetchingNextPage && !!loadMore,
    })
    useEffect(() => {
        if (sentinelInView) loadMore?.()
    }, [sentinelInView, loadMore])

    if (isLoading) return <ConversationSkeleton />
    if (isError) return error
    if (isEmpty) return empty

    return (
        <>
            <ul data-testid={testId} className="list-none">
                {conversations.map((conversation, index) => {
                    const view = toConversationView(conversation, now)
                    return (
                        <ConversationRow
                            key={conversation.id}
                            testId="message-row"
                            conversationId={conversation.id}
                            view={view}
                            active={
                                !!selectedSlug &&
                                !!view.slug &&
                                view.slug.toLowerCase() === selectedSlug.toLowerCase()
                            }
                            rule={index > 0}
                            chatAction={chatActions.get(conversation.id)}
                            busy={deletingId !== null}
                            locale={locale}
                            now={now}
                            onOpen={() => onOpen(conversation)}
                            onDelete={() => onDelete(conversation)}
                        />
                    )
                })}
            </ul>

            {/* Zero-height and outside the list, so it is neither a row nor a tab stop. */}
            <div ref={sentinelRef} aria-hidden="true" className="h-px" />

            {isFetchingNextPage && (
                <div className="flex items-center justify-center py-6">
                    <Loader label={t('common_loading')} />
                </div>
            )}
        </>
    )
}
