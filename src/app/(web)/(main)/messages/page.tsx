import { MessagesView } from '@features/message'
import { getServerT } from '@shared/i18n/server'
import type { Metadata } from 'next'

/**
 * `/messages` — the account's conversations. Legacy's path, unchanged (`pages/messages`).
 *
 * In `(main)` for the shell, and **outside `(rail)`**: this is the one product screen that is not a
 * 612 column. Its two panes run to 1504px, so the end rail — pinned 22px past a 612 column's edge —
 * would land on the chat pane at every width it is shown. `(rail)/layout.tsx` states the rule.
 *
 * No global top bar either: the list brings its own title and search, as legacy's does, and a tab
 * bar destination (`TAB_PATHS`) so the bottom bar stays on a phone.
 *
 * `noindex, nofollow` and not disallowed in `robots.ts`, for the reason `/notification` gives: a
 * disallowed URL is never fetched, so its `noindex` is never read.
 *
 * Everything under the title is client code — the list is `messenger/…` as *this bearer*, and there
 * is no SSR bearer (`shared/lib/api/token.ts`).
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
    return (
        <main className="flex flex-1 flex-col">
            <MessagesView />
        </main>
    )
}
