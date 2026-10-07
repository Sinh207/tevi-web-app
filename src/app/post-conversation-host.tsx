'use client'

import { useOpenConversation } from '@features/message'
import { PostConversationProvider } from '@features/post'
import type { ReactNode } from 'react'

/**
 * Hands every `PostCard` a way to open a conversation with the post's space — the card's *Send
 * message* (legacy's `BtnSendMain`).
 *
 * A bridge in `app/` because the two features cannot meet anywhere else: `features/message` imports
 * `features/post`, so the card cannot import the hook, and `app/` is the layer allowed to see both.
 * The same arrangement as `ShareInMessageProvider` beside it in `session-providers.tsx`.
 *
 * Inside the session stack because `useOpenConversation` needs the account (it gates a guest) and
 * the chat popup's store; a webview mounts no session, so its cards keep the button `disabled`.
 */
export function PostConversationHost({ children }: { children: ReactNode }) {
    const open = useOpenConversation()
    return <PostConversationProvider open={open}>{children}</PostConversationProvider>
}
