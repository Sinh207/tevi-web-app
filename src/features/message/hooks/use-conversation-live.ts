'use client'

import { useAuth } from '@features/auth'
import { useSocketEvent } from '@features/realtime'
import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useRef } from 'react'
import { forgetConversationCache, messageKeys } from '../api/message-api'

/**
 * How long a burst of frames is gathered before the list is asked again. One message produces two
 * or three frames (`new_message`, then `update_conversation`, then the other side's
 * `seen_message`), and a busy inbox produces them in runs — without this, every frame is a full
 * re-read of every loaded page.
 */
const COALESCE_MS = 300

/**
 * Keeps the conversation list live while it is on screen.
 *
 * The five message frames are **signals**: none of their payloads is written anywhere. CLAUDE.md's
 * third primitive, and here it is also the fix for legacy's worst list bug — its handlers splice the
 * frame into local state (`replaceLatestMessage`, `pushConversationToTopNewMessage`), and a frame
 * that arrives before the HTTP response it overtakes is simply lost, so the preview stays one
 * message behind until reload.
 *
 * Mounted by the list screen and nowhere else. A frame that arrives while no list is mounted costs
 * nothing, and the next mount refetches past `staleTime` anyway — except the unread count, which is
 * invalidated regardless because a badge may be reading it from the shell.
 */
export function useConversationLive() {
    const { activeId } = useAuth()
    const queryClient = useQueryClient()
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

    const flush = useCallback(async () => {
        timer.current = null
        await forgetConversationCache(activeId)
        queryClient.invalidateQueries({ queryKey: messageKeys.all })
    }, [activeId, queryClient])

    const schedule = useCallback(() => {
        if (timer.current !== null) return
        timer.current = setTimeout(flush, COALESCE_MS)
    }, [flush])

    /*
     * Cleared on unmount only. A refresh that was pending across an account switch runs once more
     * and invalidates `messageKeys.all` — every account's keys, the new one's included, which is a
     * refetch it was going to make anyway since its list has only just mounted.
     */
    useEffect(
        () => () => {
            if (timer.current !== null) clearTimeout(timer.current)
            timer.current = null
        },
        [],
    )

    useSocketEvent('new_message', schedule)
    useSocketEvent('update_message', schedule)
    useSocketEvent('deleted_message', schedule)
    useSocketEvent('seen_message', schedule)
    useSocketEvent('update_conversation', schedule)
}
