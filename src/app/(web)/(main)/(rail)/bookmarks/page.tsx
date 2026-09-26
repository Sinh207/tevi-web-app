import { PageBackBar } from '@features/navigation'
import { BookmarkBarActions } from '@features/post'
import { getServerT } from '@shared/i18n/server'
import type { Metadata } from 'next'
import { BookmarksScreen } from './bookmarks-screen'

/**
 * `/bookmarks` — every post this account has saved.
 *
 * The URL is legacy's (`pages/bookmarks`), kept verbatim because the cutover is same-origin: the
 * drawer row, any link somebody has kept and the mobile apps all resolve straight here.
 *
 * A sub-page, so it sits in `(main)` with its own back bar rather than in `(tabs)` under the global
 * one — the same shape `/notification` and `/follow-requests` take, and it is reached the same way,
 * from one row in the account drawer.
 *
 * **`noindex, nofollow`.** A personal list whose content differs for every visitor, means nothing to
 * a crawler, and names other people's posts. Deliberately *not* added to `robots.ts`'s disallow
 * list, for the reason `/identification` spells out: a disallowed URL is one a crawler never
 * fetches, so it never reads the `noindex` either. Crawlable + `noindex` is the combination that
 * keeps it out.
 *
 * Nothing below the bar can render on the server: the list is `v1/posts/bookmark/` as **this
 * bearer**, and there is no SSR bearer in this app by construction (`shared/lib/api/token.ts`). The
 * bar and the title are in the first HTML byte regardless.
 *
 * The bar's action is a prop for the reason `/notification` gives: `PageBackBar` is
 * `features/navigation`'s, so a server component composing it can hand a client element into its
 * `actions` slot without either feature importing the other.
 */
export async function generateMetadata(): Promise<Metadata> {
    const t = await getServerT()
    return {
        title: t('bookmarks_title'),
        alternates: { canonical: '/bookmarks' },
        robots: { index: false, follow: false },
    }
}

export default async function BookmarksPage() {
    const t = await getServerT()

    return (
        <main className="mx-auto flex w-full max-w-[612px] flex-1 flex-col">
            {/* Opaque, or the list scrolls through the bar — `AppBar` paints no background of its
                own (Figma draws it over a screen). */}
            <div className="sticky top-0 z-20 bg-(--background)">
                <PageBackBar title={t('bookmarks_title')} actions={<BookmarkBarActions />} />
            </div>
            <BookmarksScreen />
        </main>
    )
}
