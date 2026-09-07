import { PayoutMethodView } from '@features/payout'
import { getServerT } from '@shared/i18n/server'
import type { Metadata } from 'next'

/**
 * `/my-wallet/payout-method` — the payout destinations this account has saved.
 *
 * Legacy's address unchanged: the mobile apps and legacy's own bookmarks point at it, and it is what
 * `/my-wallet`'s second action row leads to.
 *
 * A shell, like the tracking screen beside it: the list is a bearer's, so the view owns the bar and
 * this file is metadata plus a `<main>`.
 *
 * **No screen-colour class here**, unlike `/my-wallet/payout-tracking`: this screen is a stack of cards
 * on the page colour rather than one full-bleed panel, so `<main>` inherits `--background` at every
 * width and the cards carry the surface. `/my-wallet` is the same shape, and `PAYOUT_CARD` says why.
 *
 * `noindex` and absent from `robots.ts`, for the reason `/my-wallet` spells out: there is no bearer
 * server-side, somebody's bank details mean nothing to a crawler, and a *disallowed* URL is never
 * fetched — so it never reads the `noindex` that is what actually keeps it out of the index.
 */
export async function generateMetadata(): Promise<Metadata> {
    const t = await getServerT()
    return {
        title: t('payout_method_title'),
        alternates: { canonical: '/my-wallet/payout-method' },
        robots: { index: false, follow: false },
    }
}

export default function PayoutMethodPage() {
    return (
        <main className="flex flex-1 flex-col">
            <PayoutMethodView />
        </main>
    )
}
