'use client'

import { useAuth } from '@features/auth'
import { useInfiniteQuery } from '@tanstack/react-query'
import { useCallback, useMemo } from 'react'
import { messageApi, messageKeys } from '../api/message-api'
import type { Conversation, ConversationFilter } from '../api/types'
import type { ConversationCursor } from '../lib/conversation-page'

export interface UseConversationsResult {
    conversations: Conversation[]
    isLoading: boolean
    isError: boolean
    /** The first page came back and held nothing. */
    isEmpty: boolean
    refetch: () => void
    hasNextPage: boolean
    isFetchingNextPage: boolean
    loadMore: () => void
}

/**
 * One folder of the conversation list — All or Unread.
 *
 * Legacy keeps both folders in `useState` inside a provider mounted on **every page**, fetched by
 * hand, spliced by hand on every socket frame (`pushConversationToTop`, `replaceLatestMessage`,
 * `handleUpdateConversationUnread`, …) and never refetched, so a frame it mishandles is wrong until
 * reload. Here each folder is a query: the socket invalidates it (`useConversationLive`) and the
 * server orders it. The service already sorts by latest message, so "push to top" is what a refetch
 * does on its own.
 *
 * Only the **mounted** folder fetches — the tabs render one panel at a time, and the Unread tab's
 * number comes from `useUnreadConversations` rather than from loading the folder.
 */
export function useConversations(filter: ConversationFilter): UseConversationsResult {
    const { activeId, isAuthenticated } = useAuth()
    const queryKey = useMemo(() => messageKeys.conversations(filter, activeId), [filter, activeId])

    const query = useInfiniteQuery({
        queryKey,
        initialPageParam: null as ConversationCursor | null,
        queryFn: ({ pageParam, signal }) =>
            messageApi.getConversations({ filter, cursor: pageParam, accountId: activeId, signal }),
        getNextPageParam: last => last.next,
        enabled: isAuthenticated,
    })

    /*
     * Deduplicated by id. A cursor list re-read while a message lands can hand back a conversation
     * on page 2 that page 1 already moved to the top; rendering both is two rows with one key.
     */
    const conversations = useMemo(() => {
        const seen = new Set<string>()
        const rows: Conversation[] = []
        for (const page of query.data?.pages ?? []) {
            for (const row of page.results) {
                if (seen.has(row.id)) continue
                seen.add(row.id)
                rows.push(row)
            }
        }
        return rows
    }, [query.data])

    const { fetchNextPage, hasNextPage, isFetchingNextPage } = query
    const loadMore = useCallback(() => {
        if (!hasNextPage || isFetchingNextPage) return
        fetchNextPage()
    }, [fetchNextPage, hasNextPage, isFetchingNextPage])

    return {
        conversations,
        isLoading: query.isLoading,
        isError: query.isError,
        isEmpty: !query.isLoading && !query.isError && conversations.length === 0,
        refetch: () => {
            query.refetch()
        },
        hasNextPage,
        isFetchingNextPage,
        loadMore,
    }
}
