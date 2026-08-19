import { ChannelEmptyState } from '@features/channel'
import {
    EARNINGS_ART,
    EARNINGS_CONTAINER,
    type EarningsDay,
    EarningsReportSkeleton,
} from '@features/earnings'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { EarningsPreview } from './preview'

export const metadata: Metadata = {
    title: 'Earnings report',
    robots: { index: false, follow: false },
}

/**
 * Dev-only preview of the earnings report's rows and states: `pnpm dev`, then open `/dev/earnings`.
 * 404s in production (`proxy.ts` stops the request; the `notFound()` below is the belt to that
 * braces).
 *
 * It exists for the reason `/dev/blocked-accounts` does — the real screen is **unreachable without
 * a signed-in creator who has actually earned money**, so a design pass on it otherwise means
 * either faking an API response or waiting for a payout. Every state the row has is pure props, so
 * they render here honestly: this is the shipped component with the shipped copy.
 *
 * The `EarningsReportView` around it is deliberately **not** previewed: it owns a query and a
 * gate, and a version of it that did not would be a second implementation of the screen with its
 * own drift. Its three message states (empty, error, not-owner) are `ChannelEmptyState` with
 * different copy, and the empty one is shown below because its artwork is the only thing on this
 * screen Brand actually drew.
 */

/** Fixtures, chosen for the payload shapes the row has to survive rather than four tidy days. */
const DAYS: EarningsDay[] = [
    { id: 'd1', date: Date.UTC(2025, 1, 19), total: 1284.5 },
    // Four figures with cents, to check the money column still fits beside a long date in `de`.
    { id: 'd2', date: Date.UTC(2025, 1, 18), total: 12_412.05 },
    // A zero day: the row still exists, the split below it will be empty.
    { id: 'd3', date: Date.UTC(2025, 1, 17), total: 0 },
    // Negative — a refund or chargeback. `formatEarningsAmount` keeps the sign; `formatIncomeUsd`
    // would have clamped it to `$0`, which is the behaviour this screen must not have.
    { id: 'd4', date: Date.UTC(2025, 1, 16), total: -42.2 },
]

export default function DevEarningsPage() {
    if (process.env.NODE_ENV === 'production') notFound()

    return (
        <main className="flex flex-col gap-10 p-6">
            <header className="flex flex-col gap-1">
                <h1 className="type-title-t1-bold text-(--text-title)">Earnings report</h1>
                <p className="type-dense-default text-(--text-body)">
                    `features/earnings` — the day card as `/@{'{slug}'}/earnings-report` renders it.
                    Press a row to open its breakdown; the panel fetches for real.
                </p>
            </header>

            <section className="flex flex-col gap-2">
                <h2 className="type-micro-overline text-(--text-body)">rows</h2>
                <div className={EARNINGS_CONTAINER}>
                    <EarningsPreview days={DAYS} />
                </div>
            </section>

            <section className="flex flex-col gap-2">
                <h2 className="type-micro-overline text-(--text-body)">loading</h2>
                <div className={EARNINGS_CONTAINER}>
                    <EarningsReportSkeleton count={3} />
                </div>
            </section>

            <section className="flex flex-col gap-2">
                <h2 className="type-micro-overline text-(--text-body)">empty</h2>
                <div className={EARNINGS_CONTAINER}>
                    <ChannelEmptyState
                        art={EARNINGS_ART.empty}
                        title="No earnings yet"
                        body="Start earning by going live, posting exclusive content, or enabling memberships."
                    />
                </div>
            </section>
        </main>
    )
}
