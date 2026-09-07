import { PageBackBar } from '@features/navigation'
import { CreatorPickerView, SEARCH_CONTAINER } from '@features/search'
import { getServerT } from '@shared/i18n/server'
import type { Metadata } from 'next'

/**
 * `/gift-star` — choosing a creator to gift Star to.
 *
 * ## What it is, and what it is not
 *
 * A **chooser**, not a till. Nothing is gifted on this page: picking a creator navigates to their
 * space, where `features/donation` runs the gift. Legacy's equivalent (`sheetGiftStar`) is the same —
 * its whole select handler is `router.push('/@' + slug)`.
 *
 * ## A new address, and the sibling it is named after
 *
 * Legacy has no URL for this: it is a sheet over `/my-star`, so there is nothing in `proxy.ts` to
 * redirect — no address moved, one was added. `/gift-star` rather than `/my-star/gift` because the
 * row it is reached from sits directly under *Get Star*, which is already `/get-star`; two
 * neighbouring actions of the same kind should not have addresses of different shapes.
 *
 * Why a page at all is `CreatorPickerView`'s note, with the measurements. Short version: the rule is
 * already written in `features/payment/routes.ts` — a press that **is a navigation** gets a route —
 * and legacy renders this as an 85vh drawer on a phone, which is a screen, not a dialog.
 *
 * A sub-page, so it sits in `(main)` and not in `(tabs)`: it brings its own back bar instead of the
 * global mobile top bar. The group a route joins is what decides its chrome, which is why nothing
 * here inspects the pathname. `(rail)` because its column is 612 — the number that group's end rail
 * is pinned against.
 *
 * ## Everything below the bar is client code, and it has to be
 *
 * Both lists are fetched as this bearer — the Following grid is per-account by definition — and there
 * is no SSR bearer in this app (`shared/lib/api/token.ts`). So the server renders the shell, the bar
 * and the title; the picker resolves after hydration.
 *
 * **No `loading.tsx`**, matching `/search`, and for its reason: the first state is an empty field, so
 * a route-level skeleton has nothing to wait on — and a `loading.tsx` importing a feature barrel in
 * this app yields a client entry chunk the nonce + `strict-dynamic` CSP refuses, which paints
 * nothing at all. The Following grid's own wait is `CreatorPickerView`'s skeleton.
 *
 * ## `noindex, nofollow`, and deliberately **not** in `robots.ts`
 *
 * `nofollow` where `/search` sets `follow: true`, and the difference is what the two pages are for:
 * `/search` is a public front door whose results are worth crawling, while this one's first screen is
 * a *particular account's* Following list. It is the same pair `/my-star` and `/get-star` set.
 *
 * Disallowing it in `robots.ts` would be the reflex and it is the wrong move, for the reason those
 * two both write down: a disallowed URL is one a crawler never *fetches*, so it never reads the
 * `noindex` either, and a URL linked from a row on a real screen can still surface as a bare address.
 * Crawlable + `noindex` is the pair that keeps it out of the index.
 */
export async function generateMetadata(): Promise<Metadata> {
    const t = await getServerT()
    return {
        title: t('balance_action_gift_star'),
        alternates: { canonical: '/gift-star' },
        robots: { index: false, follow: false },
    }
}

export default async function GiftStarPage() {
    const t = await getServerT()

    return (
        <main className="flex flex-1 flex-col">
            {/* No hairline under the bar, matching `/search`: the panel below brings its own edge
                from `md` up, and a full-bleed rule across a screen whose content is already a
                bounded surface only draws a second one. */}
            <div className="sticky top-0 z-20 bg-(--background)">
                <PageBackBar title={t('balance_action_gift_star')} className={SEARCH_CONTAINER} />
            </div>
            <div className={`${SEARCH_CONTAINER} flex flex-1 flex-col md:pb-6`}>
                <CreatorPickerView testId="my-star-gift" />
            </div>
        </main>
    )
}
