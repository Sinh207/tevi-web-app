'use client'

import { useAuth } from '@features/auth'
import { useSocketEvent } from '@features/realtime'
import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useRef } from 'react'
import { forgetConversationCache, messageKeys } from '../api/message-api'
import { useUnreadConversations } from './use-unread-conversations'

/** A burst of frames (a pasted batch, a read receipt per message) is one refetch, as on the list. */
const COALESCE_MS = 300

/**
 * How many conversations have something unread, **kept live on every screen** — for chrome that
 * lives outside the Messages screen: the favicon's dot and the `(3)` in the tab's title.
 *
 * ## Why this exists beside `useUnreadConversations`
 *
 * That count is kept live by `useConversationLive`, which only the conversation pane mounts — so off
 * the Messages screen it is fetched once and then never moves, and a favicon bound to it would stay
 * dark through every message that arrived while the reader was on Home. This keeps **only the count**
 * live: the same frames `useConversationLive` listens to, coalesced the same way, and it invalidates
 * the unread-count key alone rather than `messageKeys.all`, so a reader on Home does not refetch
 * conversation pages nobody is looking at. The stored ETag for the list goes first, for the reason
 * `forgetConversationCache` gives — the count is that same endpoint, filtered.
 *
 * Read-only: it owns no cache of its own, which is the condition under which this feature exports a
 * hook at all (the barrel's note). `0` until known — a dot or a count is a claim, and "unknown" is
 * not one.
 */
export function useLiveUnreadConversations(): number {
    const { activeId } = useAuth()
    const queryClient = useQueryClient()
    const count = useUnreadConversations()
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

    const flush = useCallback(async () => {
        timer.current = null
        await forgetConversationCache(activeId)
        queryClient.invalidateQueries({ queryKey: messageKeys.unreadCount(activeId) })
    }, [activeId, queryClient])

    const schedule = useCallback(() => {
        if (timer.current !== null) return
        timer.current = setTimeout(flush, COALESCE_MS)
    }, [flush])

    useEffect(
        () => () => {
            if (timer.current !== null) clearTimeout(timer.current)
            timer.current = null
        },
        [],
    )

    useSocketEvent('new_message', schedule)
    useSocketEvent('seen_message', schedule)
    useSocketEvent('deleted_message', schedule)
    useSocketEvent('update_conversation', schedule)

    return count ?? 0
}
