import { MY_STAR_CONTAINER, MyStarView } from '@features/my-star'
import { PageBackBar } from '@features/navigation'
import { getServerT } from '@shared/i18n/server'
import type { Metadata } from 'next'

/**
 * `/my-star` — the account's Star balance and its ledger.
 *
 * ## A new address, and the split it comes from
 *
 * Legacy has one screen at `/my-wallet` with two tabs, Star and Currency. The design splits them
 * and its handoff note says which half keeps the old address: *"bên My wallet bỏ phần Star đi"* —
 * My wallet loses the Star part. So `/my-wallet` stays put and narrows, and this is where the Star
 * half went. Legacy's `/my-wallet/transaction-history?currency=tvs` redirects here from `proxy.ts`.
 *
 * A sub-page, so it sits in `(main)` and **not** in `(tabs)`: it brings its own back bar instead of
 * the global mobile top bar. The group a route joins is what decides its chrome, which is why
 * nothing here inspects the pathname.
 *
 * ## Everything below the bar is client code, and it has to be
 *
 * The balance is `billy/v5/billing/balance/` **as this bearer**, and there is no SSR bearer in this
 * app by construction (`shared/lib/api/token.ts`). So the server renders the shell, the bar and the
 * title, and the figures resolve after hydration. This is not a case `createServerApiModel` could
 * improve: that client is for public content, and a wallet is the opposite of public.
 *
 * ## `noindex, nofollow`, and deliberately **not** in `robots.ts`
 *
 * A personal balance: different for every visitor, meaningless to a crawler, and money. Legacy sets
 * the same pair on its wallet routes.
 *
 * Disallowing it in `robots.ts` would be the reflex and it is the wrong move, for the reason
 * `/identification` and the earnings report both write down: a disallowed URL is one a crawler never
 * *fetches*, so it never reads the `noindex` either — and a URL linked from a row in the account
 * drawer on every screen can still surface as a bare address. Crawlable + `noindex` is the
 * combination that actually keeps it out of the index.
 */
export async function generateMetadata(): Promise<Metadata> {
    const t = await getServerT()
    return {
        title: t('balance_star_title'),
        alternates: { canonical: '/my-star' },
        robots: { index: false, follow: false },
    }
}

export default async function MyStarPage() {
    const t = await getServerT()

    return (
        <main className="flex flex-1 flex-col">
            {/*
             * Opaque and sticky, as on `/identification`: the content scrolls under the bar, so a
             * transparent one would show rows through the title. No hairline — the cards below
             * bring their own edges and a full-bleed rule would only draw a second one.
             */}
            <div className="sticky top-0 z-20 bg-(--background)">
                {/*
                 * ## No Star pill in the bar, and that is a considered omission
                 *
                 * Both comps draw one in the trailing slot — and in both it is **scroll-linked**:
                 * it fades in as the balance card leaves the viewport and doubles as the shortcut
                 * to the purchase screen. Neither half of that is available in this pass. The
                 * scroll behaviour needs an observer on the page's scroll container (the same one
                 * the comp's card → full-bleed transition needs, also deferred), and the
                 * destination does not exist yet.
                 *
                 * Shipping the pill anyway would mean a permanently visible control that goes
                 * nowhere, restating the figure in the card twelve pixels below it. That is worse
                 * than absent on both counts — see `BalanceActionRows` on dead controls. It lands
                 * with the scroll transition and `/get-star`, together, because it only makes
                 * sense with them.
                 */}
                <PageBackBar title={t('balance_star_title')} className={MY_STAR_CONTAINER} />
            </div>
            <div className={`${MY_STAR_CONTAINER} flex flex-1 flex-col pb-6`}>
                <MyStarView />
            </div>
        </main>
    )
}
