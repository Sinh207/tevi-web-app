import { HomeView } from '@features/home'
import { getServerT } from '@shared/i18n/server'
import type { Metadata } from 'next'

/**
 * `/` — the feed of the spaces this account follows.
 *
 * ## The shell is server-rendered and the feed is not, by construction
 *
 * The feed is `followed-channels/threads/` **as this bearer**, and there is no SSR bearer in this
 * app (`shared/lib/api/token.ts`: tokens live in localStorage, deliberately). So the column, the
 * tab row and the metadata are on the server and the rows resolve after — the same split
 * `/following` documents at length, and the reason neither route has a `loading.tsx`.
 *
 * ## `index, follow`, unlike `/following`
 *
 * Legacy sets `robots: 'index, follow'` here and so does this, and the difference from `/following`
 * is not an oversight in either place. What a crawler receives at `/` is the **shell** — the app's
 * name, its tagline in nine locales, its chrome — because the feed needs a bearer and a crawler has
 * none. That shell is the site's front door and should be indexed. `/following` has no such
 * shell: without a session it is an empty panel, and its content is a list of other people's
 * spaces.
 *
 * `alternates.canonical` is `/` rather than being omitted: the page is reachable at `/` and at
 * whatever the marketing links append, and one canonical keeps those from splitting.
 *
 * ## The column is 612 and carries no side padding
 *
 * 612 is the number `(rail)/layout.tsx` pins the desktop end rail against — every route in that
 * group caps there. No side padding because `PostCard` is a **full-bleed band**: its own horizontal
 * inset lives on its content (`px-3` / `md:px-6`), so padding here would inset the card's surface
 * and leave the page colour running down both sides of a feed that is meant to be edge to edge
 * below `md`.
 *
 * No top padding either, for the reason `/following` states: on a phone the global top bar is
 * directly above, and from `md` the tab row is the first thing on the page and parks at the top.
 */
export async function generateMetadata(): Promise<Metadata> {
    const t = await getServerT()
    return {
        title: t('home_title'),
        description: t('home_tagline'),
        alternates: { canonical: '/' },
    }
}

export default function HomePage() {
    return (
        <main className="mx-auto flex w-full max-w-[612px] flex-1 flex-col">
            <HomeView />
        </main>
    )
}
