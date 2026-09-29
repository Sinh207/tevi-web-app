import { NoChatSelected } from '@features/message'
import { getServerT } from '@shared/i18n/server'
import type { Metadata } from 'next'

/**
 * `/messages` — the inbox. Legacy's path, unchanged (`pages/messages`).
 *
 * The list is the layout's (`(dm)/layout.tsx`); this page is only what sits in the room pane when
 * no conversation is open — nothing below `md`, where the list is the whole screen.
 *
 * `noindex, nofollow` and not disallowed in `robots.ts`, for the reason `/notification` gives: a
 * disallowed URL is never fetched, so its `noindex` is never read.
 */
export async function generateMetadata(): Promise<Metadata> {
    const t = await getServerT()
    return {
        title: t('message_title'),
        alternates: { canonical: '/messages' },
        robots: { index: false, follow: false },
    }
}

export default function MessagesPage() {
    return <NoChatSelected />
}
