import { SEARCH_CONTAINER, SEARCH_PANEL, SEARCH_SCREEN } from '@features/search/skeleton'
import { getServerT } from '@shared/i18n/server'
import { AppBar, AppBarCluster, AppBarTitle, AppBarTitleText } from '@shared/ui/app-bar'
import { Skeleton } from '@shared/ui/skeleton'

/**
 * Shown during the streaming gap and on a client-side navigation into `/search` — which is every
 * way in, since the only two entry points are the search glyph in the desktop left rail and the one
 * in the mobile top bar.
 *
 * ## It draws the chrome, and deliberately nothing under the field
 *
 * The page's first real state is **not** a list of results: it is the Recents list, or the *Search
 * creators* prompt when there is no history — and which of the two it is comes from `localStorage`,
 * so nothing on the server can know it (`useSearchRecents`). Six rows of shimmer here would resolve
 * into a state that never contains rows, i.e. the exact layout shift a skeleton exists to prevent,
 * so `SearchSkeleton` is not imported at all.
 *
 * What *is* known is everything around it — the bar, the card, and the field's box — and that is
 * what makes this file worth having: without a boundary the router holds the **previous** page on
 * screen until the RSC payload lands, so pressing the search glyph appears to do nothing. With it,
 * the screen the reader asked for is there immediately and only the content fills in.
 *
 * `SearchView`'s idle branch paints the same nothing under the same field while it waits for the
 * device's list, so the two moments are one continuous layout rather than two.
 *
 * ## The bar is drawn here, and it is not `PageBackBar`
 *
 * The bar lives in `page.tsx`, so this boundary replaces it — unlike `/my-star`, whose bar comes
 * from a layout and is already on screen. And `PageBackBar` is a client component wanting a router,
 * while a skeleton has nothing to navigate: so this is the DS `AppBar` frame with the real title —
 * a server component, so `getServerT()` gives it the same words the page will print — over a 40px
 * disc where the back button lands. A control that cannot be pressed yet is drawn as its own shape,
 * never as a live button that does nothing. `md:px-0` and the `max-w` reserve are `PageBackBar`'s
 * own, so the title sits where it will sit.
 *
 * No hooks anywhere, which is what lets this render on the server.
 */
export default async function Loading() {
    const t = await getServerT()

    return (
        <main className={`flex flex-1 flex-col ${SEARCH_SCREEN}`}>
            {/* The page's own sticky wrapper, verbatim — a skeleton that scrolls differently from
                the screen it stands in for is a second layout. */}
            <div className={`sticky top-0 z-20 ${SEARCH_SCREEN}`}>
                <AppBar className={`md:px-0 ${SEARCH_CONTAINER}`}>
                    <AppBarCluster className="min-w-0">
                        <Skeleton w={40} h={40} circle />
                    </AppBarCluster>
                    <AppBarTitle className="max-w-[calc(100%-160px)]">
                        {/* `span`, not `h1`: the page's real bar carries the document's only h1,
                            and a skeleton announcing a second one would put two in the document
                            for the moment both exist. */}
                        <AppBarTitleText as="span" className="max-w-full truncate">
                            {t('search_title')}
                        </AppBarTitleText>
                    </AppBarTitle>
                </AppBar>
            </div>
            <div className={`${SEARCH_CONTAINER} flex flex-1 flex-col md:pb-6`}>
                <div className={SEARCH_PANEL} aria-busy="true">
                    {/* The field's own box, from `SearchView`: `px-4 pt-4` around a 48px pill
                        at radius 24. Reserved as its shape rather than rendered as a real
                        `SearchBar`, which would be a client control that cannot be typed into. */}
                    <div className="px-4 pt-4">
                        <Skeleton h={48} className="rounded-[24px]" />
                    </div>
                </div>
            </div>
        </main>
    )
}
