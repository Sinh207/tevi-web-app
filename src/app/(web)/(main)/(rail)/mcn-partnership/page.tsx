import { McnPartnershipView } from '@features/channel'
import { getServerT } from '@shared/i18n/server'
import type { Metadata } from 'next'

/**
 * `/mcn-partnership` — the contract between a creator and the multi-channel network that manages
 * them: who they are managed by, how revenue is split, and the way out.
 *
 * ## The same address legacy uses
 *
 * `pages/mcn-partnership` in the legacy app, so there is nothing for `proxy.ts` to redirect — a
 * bookmark, a deep link from the mobile apps or a support article lands on this screen at the URL it
 * always had.
 *
 * A sub-page, so it sits in `(main)` and **not** in `(tabs)`: it brings its own back bar instead of
 * the global mobile top bar. It is in `(rail)` because its column caps at 612, which is that
 * layout's condition.
 *
 * ## The page is a shell, and even the bar belongs to the view
 *
 * The bar's trailing control is state — the kebab is offered only while a departure can actually be
 * scheduled — so it cannot be server-rendered, and `McnPartnershipView` owns the whole screen. Same
 * arrangement, and the same reason, as `/star-transfer`.
 *
 * Everything below is client code and has to be: the terms come from `my-channel/` **as this
 * bearer**, and there is no SSR bearer in this app by construction (`shared/lib/api/token.ts`).
 * Client components are still server-rendered, so the shell is in the first paint either way.
 *
 * ## `noindex, nofollow`, and deliberately **not** in `robots.ts`
 *
 * A personal screen whose subject is a commercial agreement — different for every visitor, and
 * meaningless to a crawler. Legacy sets the same pair.
 *
 * Disallowing it in `robots.ts` would be the reflex and it is the wrong move, for the reason
 * `/identification`, `/my-star` and `/follow-requests` all write down: a disallowed URL is one a
 * crawler never *fetches*, so it never reads the `noindex` either — and a URL linked from a drawer
 * row can still surface as a bare address. Crawlable + `noindex` is what actually keeps it out.
 */
export async function generateMetadata(): Promise<Metadata> {
    const t = await getServerT()
    return {
        title: t('mcn_partnership_title'),
        alternates: { canonical: '/mcn-partnership' },
        robots: { index: false, follow: false },
    }
}

export default function McnPartnershipPage() {
    return (
        <main className="flex flex-1 flex-col">
            <McnPartnershipView />
        </main>
    )
}
