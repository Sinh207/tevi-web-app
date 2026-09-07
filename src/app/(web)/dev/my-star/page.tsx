import { ChannelEmptyState } from '@features/channel'
import { MY_STAR_ART, MY_STAR_CONTAINER, StarBalanceCard } from '@features/my-star'
import { ActionRows, ActionRowsSkeleton } from '@shared/components/action-rows'
import { LedgerPanel, LedgerSkeleton } from '@shared/components/ledger'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { STAR_LEDGER_FIXTURE, STAR_ROWS, STAR_ROWS_INERT } from './fixtures'
import { LedgerFilterPreview } from './ledger-filter-preview'

export const metadata: Metadata = {
    title: 'My Star',
    robots: { index: false, follow: false },
}

/**
 * Dev-only preview of `/my-star`'s parts and states: `pnpm dev`, then open `/dev/my-star`.
 * 404s in production (`proxy.ts` stops the request; the `notFound()` below is the belt to that braces).
 *
 * It exists for the reason `/dev/earnings` and `/dev/blocked-accounts` do — the real screen is
 * **unreachable without a signed-in account that has actually earned or spent Star**, so a design pass on
 * it otherwise means faking an API response or spending money. Everything here is pure props, so it renders
 * honestly: the shipped markup with the shipped copy.
 *
 * `MyStarView` itself is deliberately **not** previewed. It owns queries and a session gate, and a version
 * of it that did not would be a second implementation of the screen with its own drift — the same call
 * `/dev/earnings` makes about `EarningsReportView`.
 *
 * Copy is inlined rather than translated: a dev preview that needed i18n plumbing would be a second
 * consumer of every key. The strings are the `en` values verbatim, which also makes a drift visible.
 */
export default function DevMyStarPage() {
    if (process.env.NODE_ENV === 'production') notFound()

    return (
        <main className="flex flex-col gap-10 p-6">
            <header className="flex flex-col gap-1">
                <h1 className="type-title-t1-bold text-(--text-title)">My Star</h1>
                <p className="type-dense-default text-(--text-body)">
                    `features/my-star` — the hero card, the action rows and the ledger, as
                    `/my-star` composes them. The filter menu is live; nothing here fetches or
                    writes.
                </p>
            </header>

            <section className="flex flex-col gap-2">
                <h2 className="type-micro-overline text-(--text-body)">hero · known and unknown</h2>
                <div className={`${MY_STAR_CONTAINER} flex flex-col gap-3`}>
                    <StarBalanceCard label="Active Star Balance" value="1,284" />
                    {/* `—` and not `0`: a zero is a claim about somebody's money. */}
                    <StarBalanceCard label="Active Star Balance" value="—" />
                </div>
            </section>

            <section className="flex flex-col gap-2">
                <h2 className="type-micro-overline text-(--text-body)">
                    action rows — as `/my-star` draws them, then the two inert states it no longer
                    reaches: "coming soon" and a reason about this account
                </h2>
                <div className={`${MY_STAR_CONTAINER} flex flex-col gap-3`}>
                    <ActionRows rows={STAR_ROWS} unavailableLabel="Coming soon" />
                    <ActionRows rows={STAR_ROWS_INERT} unavailableLabel="Coming soon" />
                </div>
            </section>

            <section className="flex flex-col gap-2">
                <h2 className="type-micro-overline text-(--text-body)">
                    ledger — the payload shapes a row has to survive
                </h2>
                <div className={MY_STAR_CONTAINER}>
                    <LedgerPanel title="Transaction history" groups={STAR_LEDGER_FIXTURE} />
                </div>
            </section>

            <section className="flex flex-col gap-2">
                <h2 className="type-micro-overline text-(--text-body)">
                    filter — off, then on. The glyph is the only thing on this header that can say a
                    filter is applied.
                </h2>
                <LedgerFilterPreview />
            </section>

            <section className="flex flex-col gap-2">
                <h2 className="type-micro-overline text-(--text-body)">loading</h2>
                <div className={`${MY_STAR_CONTAINER} flex flex-col gap-3`}>
                    <ActionRowsSkeleton count={2} />
                    <div className="overflow-hidden rounded-xl bg-(--background-surface)">
                        <LedgerSkeleton count={4} />
                    </div>
                </div>
            </section>

            <section className="flex flex-col gap-2">
                <h2 className="type-micro-overline text-(--text-body)">empty · filtered · error</h2>
                <div className={`${MY_STAR_CONTAINER} flex flex-col gap-3`}>
                    {/*
                     * Three states, side by side, because the thing worth checking is that they read
                     * differently. Legacy uses one message for the first two — which on a wallet tells a
                     * creator with a filter applied that they have never had a transaction — and has no
                     * error state at all, so a network blip says the same thing.
                     */}
                    <div className="overflow-hidden rounded-xl bg-(--background-surface)">
                        <ChannelEmptyState
                            art={MY_STAR_ART.empty}
                            title="No Transactions Yet"
                            body="Your galaxy is calm — no Star activity has been recorded. Start exploring and sending some sparkle!"
                        />
                    </div>
                    <div className="overflow-hidden rounded-xl bg-(--background-surface)">
                        <ChannelEmptyState
                            art={MY_STAR_ART.empty}
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
