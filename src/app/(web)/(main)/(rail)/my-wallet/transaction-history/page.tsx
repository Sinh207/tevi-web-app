import { MY_WALLET_SCREEN, WalletTransactionHistoryView } from '@features/my-wallet'
import { getServerT } from '@shared/i18n/server'
import type { Metadata } from 'next'

/**
 * `/my-wallet/transaction-history` — the whole currency ledger, with its type filter.
 *
 * ## Legacy's address, and legacy's split
 *
 * `/my-wallet` shows recent movements under a **View all** link; this page shows all of them and owns
 * the filter. The URL is legacy's unchanged, because the mobile apps and legacy's own bookmarks point
 * at it.
 *
 * ## A shell, unusually — the view owns the bar
 *
 * Every other sub-page composes its own `PageBackBar` here. This one cannot: the bar's trailing slot
 * holds the ledger's filter, whose value is client state living in `useWalletLedger`. So the whole
 * screen is one client component and this file is metadata plus a `<main>`. See the view's doc.
 *
 * `noindex` and absent from `robots.ts`, for the reasons `/my-wallet` spells out: the ledger is
 * derived from a bearer that does not exist server-side, somebody's transactions mean nothing to a
 * crawler, and a *disallowed* URL is never fetched — so it never reads the `noindex` that is what
 * actually keeps it out of the index.
 */
export async function generateMetadata(): Promise<Metadata> {
    const t = await getServerT()
    return {
        title: t('balance_txn_title'),
        alternates: { canonical: '/my-wallet/transaction-history' },
        robots: { index: false, follow: false },
    }
}

export default function WalletTransactionHistoryPage() {
    return (
        // `MY_WALLET_SCREEN`, because this page is a **single panel** — see that constant and
        // `docs/DESIGN_SYSTEM.md` §6. `<main>` carries it as well as the panel, so the area under a
        // short list is the same plane rather than a strip of page colour beneath it.
        <main className={`flex flex-1 flex-col ${MY_WALLET_SCREEN}`}>
            <WalletTransactionHistoryView />
        </main>
    )
}
