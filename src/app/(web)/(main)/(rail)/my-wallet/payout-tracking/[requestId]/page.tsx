import { PayoutDetailView } from '@features/payout'
import { getServerT } from '@shared/i18n/server'
import type { Metadata } from 'next'

/**
 * `/my-wallet/payout-tracking/{requestId}` — one payout request in full.
 *
 * Legacy's address unchanged (`payoutTracking/[requestId]`), and it is what a row on the tracking list
 * links to.
 *
 * A shell, like its parent: the request is a bearer's, so the view owns the bar and this file is
 * metadata plus a `<main>`.
 *
 * `noindex` and absent from `robots.ts`, for the reasons `/my-wallet` spells out — the request is
 * derived from a bearer that does not exist server-side, somebody's withdrawal means nothing to a
 * crawler, and a *disallowed* URL is never fetched so it never reads the `noindex`.
 *
 * The **id is not in the title**. A payout's request number is not a name and would put an account's
 * transaction reference in the browser history and in any shared screenshot of a tab strip.
 */
export async function generateMetadata({
    params,
}: {
    params: Promise<{ requestId: string }>
}): Promise<Metadata> {
    // Awaited in sequence, matching `[slug]/page.tsx`. `Promise.all` over `params` and an async
    // request API hung the route in dev — the request never answered at all.
    const { requestId } = await params
    const t = await getServerT()
    return {
        title: t('payout_detail_title'),
        alternates: { canonical: `/my-wallet/payout-tracking/${requestId}` },
        robots: { index: false, follow: false },
    }
}

export default async function PayoutDetailPage({
    params,
}: {
    params: Promise<{ requestId: string }>
}) {
    const { requestId } = await params

    return (
        // `--background`: three cards separated by the page colour, not one full-bleed panel.
        // See `PayoutDetailView` — this screen is not a single panel.
        <main className="flex flex-1 flex-col">
            <PayoutDetailView id={requestId} />
        </main>
    )
}
