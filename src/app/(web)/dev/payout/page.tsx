import { ChannelEmptyState } from '@features/channel'
import {
    PAYOUT_ART,
    PAYOUT_CONTAINER,
    PayoutMethodSkeleton,
    PayoutRequestRow,
    PayoutRequestSkeleton,
} from '@features/payout'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { PayoutDetailPreview } from './detail-preview'
import {
    PAYOUT_DETAIL_FIXTURE,
    PAYOUT_DETAIL_REJECTED,
    PAYOUT_FIXTURE,
    PAYOUT_METHOD_FIXTURE,
} from './fixtures'
import { PayoutMethodPreview } from './method-preview'
import { PayoutRequestPreview } from './request-preview'

export const metadata: Metadata = {
    title: 'Payout',
    robots: { index: false, follow: false },
}

/**
 * `/dev/payout` — the payout rows, every status, and the states around them.
 *
 * The real screens need a signed-in creator who has actually requested a withdrawal — and, for the
 * saved-method section, one who has configured a destination — so five of the six tracking rows below
 * are otherwise unreachable in development, and the sixth (an unknown status) is unreachable full stop
 * until billy invents one. The method rows add three more of those: the `error` status only the backend
 * can set, a daily limit it did not send, and the per-method detail table.
 */
export default function DevPayoutPage() {
    if (process.env.NODE_ENV === 'production') notFound()

    return (
        <main className="flex flex-col gap-8 py-8">
            <header className={PAYOUT_CONTAINER}>
                <h1 className="type-title-t1-bold text-(--text-title)">Payout</h1>
                <p className="type-dense-default text-(--text-body)">
                    Tracking rows, their five statuses and the one they do not have a name for.
                </p>
            </header>

            <section className="flex flex-col gap-2">
                <h2 className={`${PAYOUT_CONTAINER} type-micro-overline text-(--text-body)`}>
                    rows · in progress / success / waiting / investigating / rejected / unknown
                </h2>
                <div className={PAYOUT_CONTAINER}>
                    <div className="overflow-clip rounded-xl bg-(--background-surface)">
                        {PAYOUT_FIXTURE.map((payout, index) => (
                            <PayoutRequestRow key={payout.id} payout={payout} rule={index > 0} />
                        ))}
                    </div>
                </div>
            </section>

            <section className="flex flex-col gap-2">
                <h2 className={`${PAYOUT_CONTAINER} type-micro-overline text-(--text-body)`}>
                    detail · in progress / rejected with a waived fee
                </h2>
                <div className={`${PAYOUT_CONTAINER} flex flex-col gap-4`}>
                    <PayoutDetailPreview request={PAYOUT_DETAIL_FIXTURE} />
                    <PayoutDetailPreview request={PAYOUT_DETAIL_REJECTED} />
                </div>
            </section>

            <section className="flex flex-col gap-2">
                <h2 className={`${PAYOUT_CONTAINER} type-micro-overline text-(--text-body)`}>
                    request · speed cards and the fee breakdown — press the three `?` and the locked
                    Fast card
                </h2>
                <div className={PAYOUT_CONTAINER}>
                    <PayoutRequestPreview />
                </div>
            </section>

            <section className="flex flex-col gap-2">
                <h2 className={`${PAYOUT_CONTAINER} type-micro-overline text-(--text-body)`}>
                    saved methods · bank / usdt in error / zelle / stripe — press a row for its
                    detail
                </h2>
                <div className={PAYOUT_CONTAINER}>
                    <PayoutMethodPreview methods={PAYOUT_METHOD_FIXTURE} />
                </div>
            </section>

            <section className="flex flex-col gap-2">
                <h2 className={`${PAYOUT_CONTAINER} type-micro-overline text-(--text-body)`}>
                    loading · tracking rows / saved methods
                </h2>
                <div className={`${PAYOUT_CONTAINER} flex flex-col gap-4`}>
                    <div className="overflow-clip rounded-xl bg-(--background-surface)">
                        <PayoutRequestSkeleton count={4} />
                    </div>
                    {/* Four bars per card, not two: the method card has four lines, and a skeleton
                        built from the wrong parts measures differently than what replaces it. It
                        brings its own card geometry, so there is no panel around it here. */}
                    <PayoutMethodSkeleton />
                </div>
            </section>

            <section className="flex flex-col gap-2">
                <h2 className={`${PAYOUT_CONTAINER} type-micro-overline text-(--text-body)`}>
                    empty · error
                </h2>
                {/* The same surface and the same `min-h` the real screen gives them, so the art is
                    at the size it will actually be seen at rather than centred in a tighter box. */}
                <div className={`${PAYOUT_CONTAINER} flex flex-col gap-4`}>
                    <div className="flex min-h-[420px] flex-col overflow-clip rounded-xl bg-(--background-surface)">
                        <ChannelEmptyState
                            className="flex-1"
                            art={PAYOUT_ART.empty}
                            title="No payouts yet"
                            body="There are no payout requests to track right now. Once you send a payout request, it will appear here for secure and fast processing."
                        />
                    </div>
                    <div className="flex min-h-[320px] flex-col overflow-clip rounded-xl bg-(--background-surface)">
                        <ChannelEmptyState
                            className="flex-1"
                            icon="exclamation-diamond"
                            tone="error"
                            title="Your payout requests could not be loaded"
                            body="Nothing has changed. Please try again."
                        />
                    </div>
                </div>
            </section>
        </main>
    )
}
