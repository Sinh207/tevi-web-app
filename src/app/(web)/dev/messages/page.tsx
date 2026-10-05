import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { MessagesPreview } from './preview'

export const metadata: Metadata = {
    title: 'Messages',
    robots: { index: false, follow: false },
}

/**
 * Dev-only preview of direct messages: `pnpm dev`, then open /dev/messages. 404s in production.
 *
 * What is on it, so a missing case is visible as a missing section: the list rows; the room's header
 * in each presence state (online, typing, sending a photo, offline, suspended, unknown) with its
 * menu; the connection strips; the message settings dialog; one conversation — at the popup's 390
 * and the page's 640 — holding every bubble kind (photos 1/2/3/5/10, text and photo replies, an
 * edit, bot buttons, an external link, space / post / collection / live / mini-app cards, a short
 * link resolved into a post card, gifts in both wire spellings), quote-to-original jumps, the photo
 * viewer with Reply and Delete, the unread divider, and pending text and photo sends (the paperclip
 * opens the real photo sheet); every wall; loading and empty states; and the floating window.
 *
 * The real list is unreachable without an account that has conversations in every state the DS
 * draws — muted, pinned, blocked, unread — so this renders the shipped `ConversationRow` over
 * fixtures that go through the shipped parser. `MessagesShell` and `ChatRoom` themselves are not
 * previewed: they own queries, and copies that did not would be second implementations of the
 * screen.
 */
export default function MessagesDevPage() {
    if (process.env.NODE_ENV === 'production') notFound()
    return (
        <main className="mx-auto flex w-full max-w-[900px] flex-col gap-8 p-6">
            <MessagesPreview />
        </main>
    )
}
