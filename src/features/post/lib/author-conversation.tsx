'use client'

import { createContext, type ReactNode, useContext } from 'react'

/**
 * The seam the card's **Send message** comes in through — a slot, not an import.
 *
 * Opening a conversation is `features/message`'s (`useOpenConversation`: the floating window from
 * `md` up, `/@{slug}/messages` below it, a sign-in prompt for a guest), and this feature cannot
 * import it: `features/message` imports this one — the chat room renders post cards and embeds — so
 * the edge would close a barrel cycle, the `undefined is not a function` at render time `CLAUDE.md`
 * describes. `features/share`'s "Send in message" block has the same problem and the same answer
 * (`share-in-message.tsx`): this file declares the shape, and `app/`, which may see both features,
 * puts `useOpenConversation` in the provider (`app/post-conversation-host.tsx`).
 *
 * **No provider, no conversation.** A `/app/*` webview mounts no session and therefore no provider,
 * and neither does the `/dev/post` harness; there the button stays drawn and `disabled`, the rule
 * `post-actions.tsx` keeps for a control whose destination is not available.
 */
export type OpenAuthorConversation = (slug: string) => void

const AuthorConversationContext = createContext<OpenAuthorConversation | null>(null)

/** Mounted by `app/` with `features/message`'s `useOpenConversation`. */
export function PostConversationProvider({
    open,
    children,
}: {
    open: OpenAuthorConversation
    children: ReactNode
}) {
    return <AuthorConversationContext value={open}>{children}</AuthorConversationContext>
}

/** Open a conversation with a space, or `null` where nothing provides the way to. */
export function useOpenAuthorConversation(): OpenAuthorConversation | null {
    return useContext(AuthorConversationContext)
}
