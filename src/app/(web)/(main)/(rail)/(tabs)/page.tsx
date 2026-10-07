import { HomeView } from '@features/home'
import { getPublicFeedForRequest } from '@features/home/server'
import { localizedPath, siteAlternates, siteOpenGraph } from '@shared/config/seo'
import { getServerT, getUrlLocale } from '@shared/i18n/server'
import type { Metadata } from 'next'

/**
 * `/` — the feed of the spaces this account follows.
 *
 * ## Two feeds: the reader's, and the one the server can read
 *
 * The feed is `followed-channels/threads/` **as this bearer**, and there is no SSR bearer in this
 * app (`shared/lib/api/token.ts`: tokens live in localStorage, deliberately). So a signed-in
 * reader's rows resolve in the browser, after the shell — the split `/following` documents.
 *
 * What the server *can* read is the same path from the in-cluster post service with no viewer
 * (`getPublicFeedForRequest`), and that page is what a guest and a crawler get in place of a bare
 * sign-in prompt — the front door with posts, and links into the spaces behind them, in the HTML.
 * `useHomeFeed` holds the rule for which of the two a reader sees.
 *
 * ## `index, follow`, unlike `/following`
 *
 * Legacy sets `robots: 'index, follow'` here and so does this, and the difference from `/following`
 * is not an oversight in either place. What a crawler receives at `/` is the shell — the app's
 * name, its tagline in nine locales, its chrome — plus the public page of posts above when the
 * post service had one. That is the site's front door and should be indexed. `/following` has no such
 * shell: without a session it is an empty panel, and its content is a list of other people's
 * spaces.
 *
 * `alternates.canonical` is `/` rather than being omitted: the page is reachable at `/` and at
 * whatever the marketing links append, and one canonical keeps those from splitting. The one
 * parameter that does make a different page is `?lang=`, which is canonical to itself and listed
 * in `hreflang` — `siteAlternates` has the rule.
 *
 * ## The column is 612 from `md`, the full width below it, and carries no side padding
 *
 * Below `md` the feed is bands edge to edge at **every** phone and tablet width — capped at 612 it
 * left a 600–899px window with a narrow column floating in the page colour under a full-width top
 * bar and tab bar, which read as a desktop layout that had not finished collapsing.
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
    // The language the URL names decides the canonical, `og:url` and `hreflang` — see `siteAlternates`.
    const urlLocale = await getUrlLocale()
    const alternates = siteAlternates('/', urlLocale)
    const title = t('home_meta_title')
    const description = t('home_meta_description')
    return {
        // `absolute`: legacy's home title already ends in the brand, so the root template would
        // make it `… | Tevi · Tevi`.
        title: { absolute: title },
        description,
        alternates,
        openGraph: siteOpenGraph({ url: localizedPath('/', urlLocale), title, description }),
    }
}

export default async function HomePage() {
    // The anonymous first page, for the guest and the crawler — `features/home/api/home-server-api.ts`.
    const publicFeed = await getPublicFeedForRequest()
    return (
        <main className="mx-auto flex w-full flex-1 flex-col md:max-w-[612px]">
            <HomeView publicFeed={publicFeed} />
        </main>
    )
}
