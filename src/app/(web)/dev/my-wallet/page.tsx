import { ChannelEmptyState } from '@features/channel'
import {
    CurrencyChip,
    MY_WALLET_ART,
    MY_WALLET_CONTAINER,
    TotalBalanceCard,
} from '@features/my-wallet'
import { ActionRows, ActionRowsSkeleton } from '@shared/components/action-rows'
import { LedgerPanel, LedgerSkeleton } from '@shared/components/ledger'
import { Alert, AlertContent, AlertTitle } from '@shared/ui/alert'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { WALLET_LEDGER_FIXTURE, WALLET_ROWS } from './fixtures'

export const metadata: Metadata = {
    title: 'My wallet',
    robots: { index: false, follow: false },
}

/**
 * Dev-only preview of `/my-wallet`'s parts and states: `pnpm dev`, then open `/dev/my-wallet`.
 * 404s in production (`proxy.ts` stops the request; the `notFound()` below is the belt to that braces).
 *
 * Same reasoning as `/dev/my-star` and `/dev/earnings`: the real screen is **unreachable without a
 * signed-in creator who has actually earned**, so a design pass on it otherwise means faking an API
 * response. Everything here is pure props.
 *
 * `MyWalletView` itself is deliberately **not** previewed — it owns queries, a session gate and the
 * currency switcher, and a version of it that did not would be a second implementation of the screen.
 *
 * Copy is inlined rather than translated, and is the `en` values verbatim.
 */
export default function DevMyWalletPage() {
    if (process.env.NODE_ENV === 'production') notFound()

    return (
        <main className="flex flex-col gap-10 p-6">
            <header className="flex flex-col gap-1">
                <h1 className="type-title-t1-bold text-(--text-title)">My wallet</h1>
                <p className="type-dense-default text-(--text-body)">
                    `features/my-wallet` — the hero card, the free-payout banner, the withdraw rows
                    and the ledger, as `/my-wallet` composes them. Nothing here fetches or writes.
                </p>
            </header>

            <section className="flex flex-col gap-2">
                <h2 className="type-micro-overline text-(--text-body)">
                    hero — converted, USD-only, and unknown
                </h2>
                <div className={`${MY_WALLET_CONTAINER} flex flex-col gap-3`}>
                    <TotalBalanceCard
                        label="Total balance"
                        value="₫111,760,762"
                        subValue="$4,400.03"
                        currencyControl={<CurrencyChip code="VND" />}
                    />
                    {/* USD selected: the second line is dropped, because printing `$4,400.03` twice reads
                        as a rendering bug rather than as two facts. */}
                    <TotalBalanceCard
                        label="Total balance"
                        value="$4,400.03"
                        currencyControl={<CurrencyChip code="USD" />}
                    />
                    {/* A currency the exchange service gave no symbol for — the code stands in for one. */}
                    <TotalBalanceCard
                        label="Total balance"
                        value="XAF 2,640,018"
                        subValue="$4,400.03"
                        currencyControl={<CurrencyChip code="XAF" />}
                    />
                    {/* `—` and not `0`: a zero is a claim about somebody's money. */}
                    <TotalBalanceCard
                        label="Total balance"
                        value="—"
                        currencyControl={<CurrencyChip code="USD" />}
                    />
                </div>
            </section>

            <section className="flex flex-col gap-2">
                <h2 className="type-micro-overline text-(--text-body)">
                    free-payout banner · withdraw rows (all three not ready yet)
                </h2>
                <div className={`${MY_WALLET_CONTAINER} flex flex-col gap-3`}>
                    <Alert status="success" role="status" className="flex-none">
                        <AlertContent>
                            <AlertTitle>
                                🎉 Your first payout is free! Enjoy 0% withdrawal fee this time.
                            </AlertTitle>
                        </AlertContent>
                    </Alert>
                    <ActionRows rows={WALLET_ROWS} unavailableLabel="Coming soon" />
                    <ActionRows
                        rows={WALLET_ROWS.map(row => ({ ...row, href: '/dev/my-wallet' }))}
                        unavailableLabel="Coming soon"
                    />
                </div>
            </section>

            <section className="flex flex-col gap-2">
                <h2 className="type-micro-overline text-(--text-body)">ledger</h2>
                <div className={MY_WALLET_CONTAINER}>
                    <LedgerPanel title="Transaction history" groups={WALLET_LEDGER_FIXTURE} />
                </div>
            </section>

            <section className="flex flex-col gap-2">
                <h2 className="type-micro-overline text-(--text-body)">loading</h2>
                <div className={`${MY_WALLET_CONTAINER} flex flex-col gap-3`}>
                    <ActionRowsSkeleton count={3} />
                    <div className="overflow-hidden rounded-xl bg-(--background-surface)">
                        <LedgerSkeleton count={4} />
                    </div>
                </div>
            </section>

            <section className="flex flex-col gap-2">
                <h2 className="type-micro-overline text-(--text-body)">empty · filtered · error</h2>
                <div className={`${MY_WALLET_CONTAINER} flex flex-col gap-3`}>
                    <div className="overflow-hidden rounded-xl bg-(--background-surface)">
                        <ChannelEmptyState
                            art={MY_WALLET_ART.empty}
                            title="No Transactions Yet"
                            body="No currency transactions found in your wallet. Once you start earning or withdrawing, records will appear here."
                        />
                    </div>
                    <div className="overflow-hidden rounded-xl bg-(--background-surface)">
                        <ChannelEmptyState
                            art={MY_WALLET_ART.empty}
                            title="No data found"
                            body="No results for this filter. Try adjusting filters to view transactions."
                        />
                    </div>
                    <div className="overflow-hidden rounded-xl bg-(--background-surface)">
                        <ChannelEmptyState
                            icon="exclamation-diamond"
                            tone="error"
                            title="Your transactions could not be loaded"
                            body="Something went wrong on our side. Try again in a moment."
                        />
                    </div>
                </div>
            </section>
        </main>
    )
}
