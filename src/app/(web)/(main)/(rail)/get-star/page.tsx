import { PageBackBar } from '@features/navigation'
import { GET_STAR_CONTAINER, GetStarView } from '@features/payment'
import { getServerT } from '@shared/i18n/server'
import type { Metadata } from 'next'

/**
 * `/get-star` — buying Star.
 *
 * ## The address is legacy's, and keeping it is the point
 *
 * Legacy serves this exact path, so nothing in `proxy.ts` has to redirect and every link the mobile
 * apps, old emails and bookmarks already carry keeps working. `features/payment/routes.ts` records
 * why this surface has **both** a page and a dialog: the presses that lead here through navigation
 * (the `+` in the top bar, the *Get Star* row on `/my-star`, the `+` on the transfer card) get the
 * page; a gift pressed with too little Star gets the sheet, because tearing down the livestream
 * behind it to sell a top-up is precisely what `docs/DEFINITION_OF_DONE.md` §3 forbids.
 *
 * A sub-page, so it sits in `(main)` and not in `(tabs)`: it brings its own back bar instead of the
 * global mobile top bar. The group a route joins is what decides its chrome, which is why nothing
 * here inspects the pathname. It is in `(rail)` because its column is 612 — the number that group's
 * end rail is pinned against.
 *
 * ## Everything below the bar is client code, and it has to be
 *
 * The catalogue is fetched as this bearer, the balance is `billy/v5/billing/balance/`, and there is
 * no SSR bearer in this app by construction (`shared/lib/api/token.ts`). So the server renders the
 * shell, the bar and the title; the prices resolve after hydration behind `GetStarSkeleton`.
 *
 * **No `loading.tsx`.** The skeleton is driven from the view's own `isLoading` instead, for the
 * reason `CardManagementSkeleton` records: a `loading.tsx` importing a feature barrel in this app
 * yields a client entry chunk the nonce + `strict-dynamic` CSP refuses, and the skeleton then
 * silently never paints. There would also be nothing for it to do — the server render has no data to
 * wait on.
 *
 * ## `noindex, nofollow`, and deliberately **not** in `robots.ts`
 *
 * Legacy sets the same pair here. The page is a till: its prices are per-region, its content is
 * meaningless to a crawler, and half of it only exists once somebody is signed in.
 *
 * Disallowing it in `robots.ts` would be the reflex and it is the wrong move, for the reason
 * `/my-star` and `/identification` both write down: a disallowed URL is one a crawler never
 * *fetches*, so it never reads the `noindex` either — and a URL linked from the top bar on every
 * screen can still surface as a bare address. Crawlable + `noindex` is the pair that actually keeps
 * it out of the index.
 */
export async function generateMetadata(): Promise<Metadata> {
    const t = await getServerT()
    return {
        title: t('payment_get_star_title'),
        alternates: { canonical: '/get-star' },
        robots: { index: false, follow: false },
    }
}

export default async function GetStarPage() {
    const t = await getServerT()

    return (
        <main className="flex flex-1 flex-col">
            {/*
             * Opaque and sticky, as on `/my-star`: the content scrolls under the bar, so a transparent
             * one would show tiles through the title. `z-20` keeps it over the page's own sticky total
             * bar (`z-10`) — the two are at opposite ends of the viewport and never meet, but the one
             * that would win a collision should be the one carrying Back.
             */}
            <div className="sticky top-0 z-20 bg-(--background)">
                <PageBackBar title={t('payment_get_star_title')} className={GET_STAR_CONTAINER} />
            </div>
            <GetStarView />
        </main>
    )
}
