'use client'

import { useAuth } from '@features/auth'
import { useTranslation } from '@shared/i18n/use-translation'
import { type QueryKey, useMutation, useQueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'
import { toast } from 'sonner'
import { forgetConversationCache, messageApi, messageKeys } from '../api/message-api'
import type { Conversation } from '../api/types'
import {
    type ConversationData,
    markConversationSeen,
    removeConversation,
} from '../lib/conversation-page'

export interface UseConversationActionsResult {
    /** The conversation being deleted, so its menu can hold and the rest stay usable. */
    deletingId: string | null
    remove: (conversation: Conversation) => void
    /**
     * Mark a conversation seen as it is opened. A no-op when nothing in it is unread, which is what
     * makes it safe to call from the row's press handler unconditionally.
     */
    markSeen: (conversation: Conversation) => void
}

/**
 * The list's two writes — **one** owner for both folders, so the All and Unread caches cannot
 * disagree about a row one of them just changed.
 *
 * - **Delete** waits for the server, as every destructive row in this app does: a conversation that
 *   vanishes and then comes back is worse than a menu that spins for 300ms.
 * - **Mark seen** is optimistic, for the reason `useInbox`'s read toggle is: it fires as the row's
 *   link navigates, so there is no row left to spin by the time the response lands. A failure is
 *   silent and self-correcting — the settle invalidates, and the count comes back.
 */
export function useConversationActions(): UseConversationActionsResult {
    const { activeId } = useAuth()
    const queryClient = useQueryClient()
    const { t } = useTranslation()

    /** Every folder of *this* account's list. The search results are a separate key family. */
    const folders = useCallback(
        (key: QueryKey) =>
            key[0] === 'message' && key[1] === 'conversations' && key[3] === (activeId ?? 'anon'),
        [activeId],
    )

    const refresh = useCallback(async () => {
        // The stored validators go first and are awaited — see `forgetConversationCache`.
        await forgetConversationCache(activeId)
        queryClient.invalidateQueries({ queryKey: messageKeys.unreadCount(activeId) })
        queryClient.invalidateQueries({
            predicate: query => folders(query.queryKey),
        })
    }, [activeId, folders, queryClient])

    const removeMutation = useMutation({
        mutationFn: (conversation: Conversation) =>
            messageApi.deleteConversation(conversation.id, activeId),
        onSuccess: async (_data, conversation) => {
            queryClient.setQueriesData<ConversationData>(
                { predicate: query => folders(query.queryKey) },
                data => removeConversation(data, conversation.id),
            )
            // A search result for it would otherwise still open a conversation that is gone.
            queryClient.removeQueries({ queryKey: ['message', 'search'] })
            await refresh()
            toast.success(t('message_conversation_deleted'), { id: 'message-action' })
        },
        meta: { showErrorToast: t('message_error_delete') },
    })

    const seenMutation = useMutation({
        mutationFn: (conversation: Conversation) =>
            messageApi.markSeenAll(
                conversation.id,
                conversation.latest_message?.id || null,
                activeId,
            ),
        onMutate: conversation => {
            queryClient.setQueriesData<ConversationData>(
                { predicate: query => folders(query.queryKey) },
                data => markConversationSeen(data, conversation.id),
            )
        },
        onSettled: refresh,
    })

    const remove = useCallback(
        (conversation: Conversation) => {
            if (removeMutation.isPending) return
            removeMutation.mutate(conversation)
        },
        [removeMutation],
    )

    const markSeen = useCallback(
        (conversation: Conversation) => {
            if ((conversation.stats?.unread_messages ?? 0) === 0) return
            seenMutation.mutate(conversation)
        },
        [seenMutation],
    )

    return {
        deletingId: removeMutation.isPending ? (removeMutation.variables?.id ?? null) : null,
        remove,
        markSeen,
    }
}
