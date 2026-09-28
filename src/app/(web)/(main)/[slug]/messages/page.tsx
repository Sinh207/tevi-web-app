import { parseChannelSlug } from '@features/channel'
import { MessagesView } from '@features/message'
import { getServerT } from '@shared/i18n/server'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

/**
 * `/@{slug}/messages` — the conversation with that space's owner. Legacy's URL
 * (`pages/[channelSlug]/messages`), unchanged: it is the link legacy's settings sheet hands out as
 * "link to your message", so it is already in people's bios.
 *
 * ## Why this `[slug]` is not the one under `(rail)`
 *
 * The space page's `[slug]` lives in `(rail)`, whose layout pins the end rail beside a 612 column —
 * it would land on this screen's chat pane — and whose `loading.tsx` is the *space's* skeleton,
 * which would flash on every conversation. So this route is a sibling in `(main)`, as `/messages`
 * is. Both groups resolve `[slug]` to the same segment name, so the router sees one dynamic segment
 * with two children, not two conflicting ones.
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
    return (
        <main className="flex flex-1 flex-col">
            <MessagesView selectedSlug={slug} />
        </main>
    )
}
