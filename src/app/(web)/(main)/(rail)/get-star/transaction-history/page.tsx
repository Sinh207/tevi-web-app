import { PageBackBar } from '@features/navigation'
import {
    GET_STAR_TRANSACTIONS_CONTAINER,
    GET_STAR_TRANSACTIONS_SCREEN,
    TransactionHistoryView,
} from '@features/payment'
import { getServerT } from '@shared/i18n/server'
import { cn } from '@shared/lib/utils'
import type { Metadata } from 'next'

/**
 * `/get-star/transaction-history` — the reader's own Star purchases.
 *
 * ## A new address, nested under the screen it belongs to
 *
 * Named the way its sibling is (`/my-wallet/transaction-history`): the same words for the same kind
 * of list, under whichever screen owns it. Legacy has no such URL — its history is a modal on the
 * purchase page — so there is nothing in `proxy.ts` to redirect: no address moved, one was added.
 *
 * It is **not** `/my-star`. That is billy's balance ledger; this is paymee's payments, and a top-up
 * that failed or is still pending never reaches the ledger at all. `TransactionHistoryView` states
 * the split at length.
 *
 * A sub-page, so it sits in `(main)` and not in `(tabs)`: it brings its own back bar instead of the
 * global mobile top bar. `(rail)` because its column is 612 — the number that group's end rail is
 * pinned against.
 *
 * ## Everything below the bar is client code, and it has to be
 *
 * The list is `checkout/v3/checkout/` **as this bearer**, and there is no SSR bearer in this app by
 * construction (`shared/lib/api/token.ts`). So the server renders the shell, the bar and the title;
 * the rows resolve after hydration behind the view's own skeleton.
 *
 * **No `loading.tsx`**, for the reason `CardManagementSkeleton` records: a `loading.tsx` importing a
 * feature barrel in this app yields a client entry chunk the nonce + `strict-dynamic` CSP refuses,
 * and the skeleton then silently never paints. There would also be nothing for it to do — the server
 * render has no data to wait on.
 *
 * ## `noindex, nofollow`, and deliberately **not** in `robots.ts`
 *
 * Somebody's purchase history: different for every visitor, meaningless to a crawler, and money.
 * Disallowing it would be the reflex and it is the wrong move, for the reason `/my-star` and
 * `/my-wallet/transaction-history` both write down — a disallowed URL is one a crawler never
 * *fetches*, so it never reads the `noindex` either. Crawlable + `noindex` is the pair that actually
 * keeps it out of the index.
 */
export async function generateMetadata(): Promise<Metadata> {
    const t = await getServerT()
    return {
        title: t('payment_view_transaction_history'),
        alternates: { canonical: '/get-star/transaction-history' },
        robots: { index: false, follow: false },
    }
}

export default async function GetStarTransactionHistoryPage() {
    const t = await getServerT()

    return (
        /*
         * The surface is the **screen** below `md` and a card from `md` up — one class in two places,
         * here and on the bar. `GET_STAR_TRANSACTIONS_SCREEN` carries the reasoning; the short version
         * is that a phone's column is already full width, so there is nothing for a card to be a card
         * against, and `<main>` has to paint it too or the area under a two-row history is a strip of
         * page colour beneath the panel.
         */
        <main className={cn('flex flex-1 flex-col', GET_STAR_TRANSACTIONS_SCREEN)}>
            {/*
             * Opaque and sticky, as on `/get-star` and `/my-star`: the rows scroll under the bar, so a
             * transparent one would show them through the title. It takes the **same** surface class,
             * which is what makes the phone one uninterrupted plane from the status bar down.
             */}
            <div className={cn('sticky top-0 z-20', GET_STAR_TRANSACTIONS_SCREEN)}>
                <PageBackBar
                    title={t('payment_view_transaction_history')}
                    /*
                     * Back goes to the purchase page rather than into history, because that is where
                     * this list is reached from and where somebody who has just checked a receipt
                     * wants to be. `PageBackBar` uses `home` only when there is nothing to go back to.
                     */
                    home="/get-star"
                    className={GET_STAR_TRANSACTIONS_CONTAINER}
                />
            </div>
            <TransactionHistoryView />
        </main>
    )
}
