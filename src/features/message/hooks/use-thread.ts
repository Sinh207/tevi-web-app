'use client'

import { useAuth } from '@features/auth'
import { useSocketEvent, useSocketReconnect } from '@features/realtime'
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useRef } from 'react'
import { forgetConversationCache, messageApi, messageKeys } from '../api/message-api'
import { type ChatMessage, type Conversation, frameIds } from '../api/types'
import type { ConversationCursor } from '../lib/conversation-page'
import {
    flattenThread,
    isOwnMessage,
    mergeNewest,
    removeMessage,
    type ThreadData,
    upsertMessage,
} from '../lib/message-thread'

export interface UseThreadResult {
    messages: ChatMessage[]
    isLoading: boolean
    isError: boolean
    refetch: () => void
    hasOlder: boolean
    isFetchingOlder: boolean
    loadOlder: () => void
    /** Write a message the server just returned (a send, an edit) into the thread. */
    put: (message: ChatMessage) => void
    /** Take a message out of the thread — after a delete the server confirmed. */
    drop: (id: string) => void
    /** Mark the conversation seen up to this message (visible tab only, once per message). */
    markSeen: (lastMessageId: string | null) => void
}

/**
 * One conversation's messages, kept live.
 *
 * ## The frames, and what each one costs
 *
 * | Frame             | For this conversation                                          |
 * |-------------------|----------------------------------------------------------------|
 * | `new_message`     | `get_message/{id}` → upsert; then mark seen if it is theirs    |
 * | `update_message`  | `get_message/{id}` → upsert (an edit)                          |
 * | `deleted_message` | remove by id                                                   |
 * | `seen_message`    | re-read the newest page and fold it in (the ticks live there)  |
 * | *reconnect*       | the same re-read, plus the list — frames in the gap are lost    |
 *
 * Legacy writes each frame's payload straight into its state, and orders nothing: a frame that
 * overtakes the HTTP response for the same message is simply the version on screen. Here the frame
 * only says *which* message to ask for (see `message-thread.ts`), and `upsertMessage` is idempotent
 * by id, so the same message arriving twice — the socket and this client's own send — is one row.
 *
 * ## Marking seen
 *
 * `mark_seen_all` once on open when the conversation has anything unread, and again whenever one of
 * *their* messages lands while the tab is visible. A hidden tab does not mark — the reader has not
 * seen it — and catches up on `visibilitychange`. Legacy marks on every frame regardless.
 */
export function useThread(conversation: Conversation | null): UseThreadResult {
    const { activeId, isAuthenticated } = useAuth()
    const queryClient = useQueryClient()
    const conversationId = conversation?.id ?? ''
    const myAlias = conversation?.me?.tevi_user_alias || null

    const queryKey = useMemo(
        () => messageKeys.messages(conversationId, activeId),
        [conversationId, activeId],
    )

    const query = useInfiniteQuery({
        queryKey,
        initialPageParam: null as ConversationCursor | null,
        queryFn: ({ pageParam, signal }) =>
            messageApi.getMessages({
                conversationId,
                cursor: pageParam,
                accountId: activeId,
                signal,
            }),
        getNextPageParam: last => last.next,
        enabled: isAuthenticated && conversationId !== '',
    })

    const messages = useMemo(() => flattenThread(query.data as ThreadData), [query.data])

    const put = useCallback(
        (message: ChatMessage) => {
            queryClient.setQueryData<ThreadData>(queryKey, data => upsertMessage(data, message))
        },
        [queryClient, queryKey],
    )

    const drop = useCallback(
        (id: string) => {
            queryClient.setQueryData<ThreadData>(queryKey, data => removeMessage(data, id))
        },
        [queryClient, queryKey],
    )

    /** The list's preview and unread badge follow every change here. */
    const refreshList = useCallback(async () => {
        await forgetConversationCache(activeId)
        queryClient.invalidateQueries({ queryKey: ['message', 'conversations'] })
        queryClient.invalidateQueries({ queryKey: messageKeys.unreadCount(activeId) })
    }, [activeId, queryClient])

    /* ---------------------------------------------------------------- seen */

    const lastMarked = useRef<string | null>(null)
    const markSeen = useCallback(
        (lastMessageId: string | null) => {
            if (!conversationId) return
            if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return
            if (lastMessageId && lastMarked.current === lastMessageId) return
            lastMarked.current = lastMessageId
            messageApi
                .markSeenAll(conversationId, lastMessageId, activeId)
                .then(refreshList)
                .catch(() => {
                    // Silent: the next message or the next visit marks again.
                    lastMarked.current = null
                })
        },
        [activeId, conversationId, refreshList],
    )

    const unreadOnOpen = conversation?.stats?.unread_messages ?? 0
    const latestId = conversation?.latest_message?.id || null
    useEffect(() => {
        if (unreadOnOpen > 0) markSeen(latestId)
    }, [unreadOnOpen, latestId, markSeen])

    const newestTheirs = useMemo(() => {
        for (let index = messages.length - 1; index >= 0; index--) {
            const message = messages[index]
            if (!isOwnMessage(message, { alias: myAlias, slug: null })) return message.id
        }
        return null
    }, [messages, myAlias])

    useEffect(() => {
        const onVisible = () => {
            if (document.visibilityState === 'visible' && newestTheirs) markSeen(newestTheirs)
        }
        document.addEventListener('visibilitychange', onVisible)
        return () => document.removeEventListener('visibilitychange', onVisible)
    }, [markSeen, newestTheirs])

    /* ---------------------------------------------------------------- frames */

    const resolve = useCallback(
        async (messageId: string) => {
            const message = await messageApi.getMessage(messageId, activeId).catch(() => null)
            if (!message || message.conversation_id !== conversationId) return
            put(message)
            if (!isOwnMessage(message, { alias: myAlias, slug: null })) markSeen(message.id)
        },
        [activeId, conversationId, markSeen, myAlias, put],
    )

    const mine = (payload: unknown) => {
        const ids = frameIds(payload)
        return ids && ids.conversationId === conversationId ? ids : null
    }

    useSocketEvent('new_message', payload => {
        const ids = mine(payload)
        if (ids?.messageId) resolve(ids.messageId)
    })
    useSocketEvent('update_message', payload => {
        const ids = mine(payload)
        if (ids?.messageId) resolve(ids.messageId)
    })
    useSocketEvent('deleted_message', payload => {
        const ids = mine(payload)
        if (ids?.messageId) drop(ids.messageId)
    })
    /** Re-read the newest page and fold it in — the ticks, and anything a dropped socket missed. */
    const refreshNewest = useCallback(() => {
        if (!conversationId) return
        messageApi
            .getMessages({ conversationId, accountId: activeId })
            .then(fresh => {
                queryClient.setQueryData<ThreadData>(queryKey, data => mergeNewest(data, fresh))
            })
            .catch(() => undefined)
    }, [activeId, conversationId, queryClient, queryKey])

    useSocketEvent('seen_message', payload => {
        if (mine(payload)) refreshNewest()
    })

    /*
     * Back after a drop: every frame in the gap is gone, so ask. Both apps do this — Android
     * refetches the open conversation's unread messages on reconnect, iOS reloads the room when it
     * returns to the foreground — and without it a message sent during a wifi blip never appears.
     * The list is re-asked too: its previews missed the same frames.
     */
    useSocketReconnect(() => {
        refreshNewest()
        refreshList()
    })

    const { fetchNextPage, hasNextPage, isFetchingNextPage } = query
    const loadOlder = useCallback(() => {
        if (!hasNextPage || isFetchingNextPage) return
        fetchNextPage()
    }, [fetchNextPage, hasNextPage, isFetchingNextPage])

    return {
        messages,
        isLoading: query.isLoading,
        isError: query.isError,
        refetch: () => {
            query.refetch()
        },
        hasOlder: hasNextPage,
        isFetchingOlder: isFetchingNextPage,
        loadOlder,
        put,
        drop,
        markSeen,
    }
}
