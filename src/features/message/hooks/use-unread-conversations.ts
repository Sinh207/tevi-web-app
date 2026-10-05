'use client'

import { useAuth } from '@features/auth'
import { useQuery } from '@tanstack/react-query'
import { messageApi, messageKeys } from '../api/message-api'

/**
 * How many conversations have something unread — the Unread tab's badge.
 *
 * `null` until it is known, and after a failure: the badge is then **absent**, never "0". Kept live
 * by `useConversationLive`, which invalidates `messageKeys.all` on every message frame, so it does
 * not poll.
 */
export function useUnreadConversations(): number | null {
    const { activeId, isAuthenticated } = useAuth()
    const query = useQuery({
        queryKey: messageKeys.unreadCount(activeId),
        queryFn: ({ signal }) => messageApi.getUnreadCount({ accountId: activeId, signal }),
        enabled: isAuthenticated,
    })
    return query.data ?? null
}
