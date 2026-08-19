import { MY_WALLET_CONTAINER, MyWalletView } from '@features/my-wallet'
import { PageBackBar } from '@features/navigation'
import { getServerT } from '@shared/i18n/server'
import type { Metadata } from 'next'

/**
 * `/my-wallet` — withdrawable earnings, their ledger, and the way out to the payout screens.
 *
 * ## Legacy's address, narrowed
 *
 * Legacy's `/my-wallet` is one screen with two tabs, Star and Currency. The design splits them and
 * its handoff note is explicit about which half keeps the address: *"bên My wallet bỏ phần Star
 * đi"*. So this URL survives the cutover unchanged — the mobile apps link to it — and now means the
 * Currency half only. The Star half is `/my-star`.
 *
 * A sub-page, so `(main)` and not `(tabs)`: its own back bar rather than the global mobile top bar.
 *
 * ## Client-only below the bar, `noindex`, and not in `robots.ts`
 *
 * All three for the same reasons as `/my-star`, whose doc spells them out: the balance is derived
 * from a bearer that does not exist server-side; a personal balance means nothing to a crawler; and
 * a *disallowed* URL is never fetched, so it never reads the `noindex` that would actually keep it
 * out of the index.
 */
export async function generateMetadata(): Promise<Metadata> {
    const t = await getServerT()
    return {
        title: t('balance_wallet_title'),
        alternates: { canonical: '/my-wallet' },
        robots: { index: false, follow: false },
    }
}

export default async function MyWalletPage() {
    const t = await getServerT()

    return (
        <main className="flex flex-1 flex-col">
            <div className="sticky top-0 z-20 bg-(--background)">
                <PageBackBar title={t('balance_wallet_title')} className={MY_WALLET_CONTAINER} />
            </div>
            <div className={`${MY_WALLET_CONTAINER} flex flex-1 flex-col pt-2 pb-6`}>
                <MyWalletView />
            </div>
        </main>
    )
}
