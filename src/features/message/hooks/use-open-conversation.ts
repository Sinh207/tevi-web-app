'use client'

import { useRequireAuth } from '@features/auth'
import { useRouter } from 'next/navigation'
import { useCallback } from 'react'
import { conversationPath } from '../routes'
import { useChatPopupStore } from '../store/chat-popup-store'

/**
 * Open the conversation with a space — legacy's `useOpenConversation`, the one way in for every
 * "Send message" button.
 *
 * Where the floating window is on screen (`hosted`: from `md` up, on a page that carries it) it
 * opens there and the reader stays on the page they were reading. Anywhere else — a phone, or a page
 * without the window — it goes to `/@{slug}/messages`, which is what legacy's full-screen drawer
 * amounted to on a phone.
 *
 * No `start_conversation_with` before it opens, which legacy makes here and then again inside the
 * room: the room asks, and its walls are the answer to a refusal. Gated on an account, as legacy's
 * `isAuthenticated` check — a guest has no inbox.
 */
export function useOpenConversation() {
    const requireAuth = useRequireAuth()
    const router = useRouter()
    const hosted = useChatPopupStore(state => state.hosted)
    const openRoom = useChatPopupStore(state => state.openRoom)

    return useCallback(
        (slug: string) =>
            requireAuth(() => {
                if (hosted) openRoom(slug)
                else router.push(conversationPath(slug))
            })(),
        [hosted, openRoom, requireAuth, router],
    )
}
