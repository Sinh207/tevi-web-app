import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { MessagesPreview } from './preview'

export const metadata: Metadata = {
    title: 'Messages',
    robots: { index: false, follow: false },
}

/**
 * Dev-only preview of the conversation row: `pnpm dev`, then open /dev/messages. 404s in
 * production.
 *
 * The real list is unreachable without an account that has conversations in every state the DS
 * draws — muted, pinned, blocked, unread — so this renders the shipped `ConversationRow` over
 * fixtures that go through the shipped parser. `MessagesView` itself is not previewed: it owns
 * queries, and a copy that did not would be a second implementation of the screen.
 */
export default function MessagesDevPage() {
    if (process.env.NODE_ENV === 'production') notFound()
    return (
        <main className="mx-auto flex w-full max-w-[900px] flex-col gap-8 p-6">
            <MessagesPreview />
        </main>
    )
}
