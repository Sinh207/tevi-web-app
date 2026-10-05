import { PageBackBar } from '@features/navigation'
import { SEARCH_CONTAINER, SEARCH_SCREEN, SearchView } from '@features/search'
import { getServerT } from '@shared/i18n/server'
import type { Metadata } from 'next'

/**
 * `/search` — find a creator's space.
 *
 * The URL is legacy's (`pages/search`), kept so existing links and anything the mobile apps
 * deep-link to still resolve on a same-origin cutover. It is reached from the search glyph in the
 * desktop left rail and in the mobile top bar, which are the only two entry points either app has.
 *
 * ## A sub-page, not a tab destination
 *
 * So it sits in `(main)` rather than `(tabs)`, and brings its own back bar instead of the global
 * mobile top bar — like `/identification` and `/settings/blocked-accounts`. Two sticky bars
 * stacked on a phone is not a screen anyone wants, and the group a route joins is the whole
 * decision (see `(main)/layout.tsx`).
 *
 * Legacy renders its own bar **only above md** (`matchUpMd && <TopBar/>`) and relies on the app
 * shell's global bar below it, which is why its container reserves
 * `var(--window-height-top-bar, 56px)` of top padding on a phone. That arrangement does not exist
 * here: a sub-page has no global bar over it, so the back bar is drawn at every width and there is
 * nothing to reserve space for.
 *
 * ## In `(rail)`, because the column is 612
 *
 * The desktop end rail is pinned on that assumption — it starts 22px past a 612 column's trailing
 * edge — so a wider page would have it land on the content. `SEARCH_CONTAINER` is that 612, and
 * the reason this route belongs in the group rather than beside the wide documents.
 *
 * ## `noindex`, and *not* in `robots.ts`
 *
 * A search screen with no term is a field and nothing else — thin by construction, and its results
 * are fetched in the browser, so a crawler that rendered it would index an empty card. Legacy
 * indexes it (`getStaticProps` with a title and `revalidate: 3600`) and there is nothing there
 * worth having.
 *
 * Deliberately **not** added to `robots.ts`'s disallow list, for the reason spelled out on
 * `/identification`: a disallowed URL is one a crawler never fetches, so it never reads the
 * `noindex` either, and a page linked from the shell on every screen can still surface as a bare
 * URL. Crawlable + `noindex` is the combination that actually keeps it out. `follow` stays on so a
 * crawler that does arrive is not told to treat the shell's links as dead ends.
 *
 * No `description` either, for the same reason: a meta description is copy written for a search
 * result snippet, and this page has asked not to have one.
 *
 * ## Everything below the bar is client code, and it has to be
 *
 * The term lives in the browser, the Following grid is *this bearer's* follows, and there is no
 * SSR bearer in this app by construction. The page still renders on the server — shell, bar and
 * title are there on first paint, and the field is interactive as soon as the view hydrates.
 *
 * The content column carries **no side padding and a bottom one only from `md`**, matching
 * `/settings/blocked-accounts`: the panel is a full-bleed card below `md` — its rows run edge to
 * edge on a phone, as the mobile app's do, and it should meet the bottom edge — so a `px-3` here
 * would inset it by 12px at every width with nothing the panel could do about it. From `md` the
 * panel is a rounded surface, and `md:pb-6` is what leaves its bottom two corners something to be
 * seen against; the panel claims the rest of the column with `flex-1`, so the gap comes out of its
 * height rather than being added below the fold.
 *
 * ## `loading.tsx` draws the chrome only
 *
 * There is no server-known moment at which the **results** skeleton is the right thing to show —
 * the screen's first state is an empty field over the Recents list, which is device state — so the
 * boundary reserves the bar, the card and the field's box and leaves the panel empty, which is
 * exactly what the hydrated screen looks like at that instant. It earns its place all the same:
 * without it the router holds the previous page on screen until this one's payload lands, and every
 * way in here is a client-side navigation from a glyph in the shell.
 *
 * It imports `@features/search/skeleton`, **never** the feature barrel — that is the shape that
 * silently never paints, because the boundary becomes its own client entry chunk and the CSP
 * refuses it. The door module carries the post-mortem.
 */
export async function generateMetadata(): Promise<Metadata> {
    const t = await getServerT()
    return {
        title: t('search_title'),
        alternates: { canonical: '/search' },
        robots: { index: false, follow: true },
    }
}

export default async function SearchPage() {
    const t = await getServerT()

    return (
        <main className={`flex flex-1 flex-col ${SEARCH_SCREEN}`}>
            {/* No hairline under the bar, matching `/settings/blocked-accounts`: the card below
                brings its own edge at `md` and up, and a full-bleed rule across a screen whose
                content is already a bounded surface only draws a second one. */}
            <div className={`sticky top-0 z-20 ${SEARCH_SCREEN}`}>
                <PageBackBar title={t('search_title')} className={SEARCH_CONTAINER} />
            </div>
            <div className={`${SEARCH_CONTAINER} flex flex-1 flex-col md:pb-6`}>
                <SearchView />
            </div>
        </main>
    )
}
