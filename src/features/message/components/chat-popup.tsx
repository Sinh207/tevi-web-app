'use client'

import { useAuth } from '@features/auth'
import { useMediaQuery } from '@shared/hooks/use-media-query'
import dynamic from 'next/dynamic'
import { CHAT_POPUP_QUERY } from '../lib/chat-popup'

/*
 * The window's body — the list, the room, the composer — is a chunk of its own: a phone never draws
 * the window, and a guest has no inbox, so neither should download it.
 */
const ChatPopupWindow = dynamic(() =>
    import('./chat-popup-window').then(module => module.ChatPopupWindow),
)

/**
 * The floating chat window in the corner of every page that has the end rail — legacy's
 * `common/chatPopup`, mounted by `app/(web)/(main)/(rail)/layout.tsx`. Legacy mounts it in the
 * protected layout and then hides it on the Messages screens and the static pages, which is exactly
 * the set of routes the `(rail)` group leaves out, so where it lives is the whole gate.
 *
 * Only from `md` (legacy's `matchUpMd`) and only for an account. Below `md` legacy's version is a
 * full-screen drawer, which is what `/@{slug}/messages` already is; `useOpenConversation` sends a
 * phone there instead.
 */
export function ChatPopup() {
    const { isAuthenticated } = useAuth()
    const wide = useMediaQuery(CHAT_POPUP_QUERY)
    if (!wide || !isAuthenticated) return null
    return <ChatPopupWindow />
}
