import { PAYOUT_SCREEN, PayoutTrackingView } from '@features/payout'
import { getServerT } from '@shared/i18n/server'
import type { Metadata } from 'next'

/**
 * `/my-wallet/payout-tracking` — every payout request, newest first.
 *
 * Legacy's address unchanged: the mobile apps and legacy's own bookmarks point at it, and it is what
 * `/my-wallet`'s third action row leads to.
 *
 * A shell, like `/my-wallet/transaction-history`: the whole screen is a bearer's, so the view owns the
 * bar and this file is metadata plus a `<main>`. See the view's doc.
 *
 * `noindex` and absent from `robots.ts`, for the reasons `/my-wallet` spells out: the list is derived
 * from a bearer that does not exist server-side, somebody's withdrawals mean nothing to a crawler, and
 * a *disallowed* URL is never fetched — so it never reads the `noindex` that is what actually keeps it
 * out of the index.
 */
export async function generateMetadata(): Promise<Metadata> {
    const t = await getServerT()
    return {
        title: t('payout_tracking_title'),
        alternates: { canonical: '/my-wallet/payout-tracking' },
        robots: { index: false, follow: false },
    }
}

export default function PayoutTrackingPage() {
    return (
        <main className={`flex flex-1 flex-col ${PAYOUT_SCREEN}`}>
            <PayoutTrackingView />
        </main>
    )
}
