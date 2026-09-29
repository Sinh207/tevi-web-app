import { parseChannelSlug } from '@features/channel'
import { ChatRoom } from '@features/message'
import { getServerT } from '@shared/i18n/server'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

/**
 * `/@{slug}/messages` — the conversation with that space's owner. Legacy's URL
 * (`pages/[channelSlug]/messages`), unchanged: it is the link legacy's settings sheet hands out as
 * "link to your message", so it is already in people's bios.
 *
 * The list beside it is the layout's (`(dm)/layout.tsx`); this page is the room pane. Not the
 * space page's `(rail)/[slug]`, whose `loading.tsx` is the *space's* skeleton and would flash on
 * every conversation.
 *
 * `[slug]` matches every single-segment path, so `/wp-admin/messages` reaches here too:
 * `parseChannelSlug` rejects anything that is not `@slug` without a request.
 *
 * Not a tab destination (`TAB_PATHS`): a conversation has its composer along the bottom edge, which
 * is where the tab bar would sit. `noindex` for `/messages`' reason.
 */
type PageProps = { params: Promise<{ slug: string }> }

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
    const { slug: raw } = await params
    const slug = parseChannelSlug(raw)
    const t = await getServerT()
    if (!slug) return {}
    return {
        title: t('message_room_title', { slug }),
        alternates: { canonical: `/@${slug}/messages` },
        robots: { index: false, follow: false },
    }
}

export default async function ConversationPage({ params }: PageProps) {
    const { slug: raw } = await params
    const slug = parseChannelSlug(raw)
    if (!slug) notFound()
    /* Keyed on the slug: another conversation is a new room — the draft, the reply and the pending
       sends belong to the one being left. */
    return <ChatRoom key={slug.toLowerCase()} slug={slug} />
}
