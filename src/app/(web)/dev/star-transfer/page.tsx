'use client'

import {
    MultiTransferDialog,
    type MultiTransferFlow,
    normalizeTransfers,
    planTransfers,
    SingleTransferDialog,
    type TemplateRow,
    TransferHistoryRow,
    TransferModeTiles,
    TransferReceiptScreen,
    useMultiTransfer,
    useSingleTransfer,
    withoutReceiver,
} from '@features/star-transfer/dev'
import { Button } from '@shared/ui/button'
import { notFound } from 'next/navigation'
import { useState } from 'react'

/**
 * Dev-only preview of `/star-transfer`'s parts: `pnpm dev`, then open `/dev/star-transfer`.
 * 404s in production (`proxy.ts` stops the request; the `notFound()` below is the belt to that braces).
 *
 * It exists because the real screen is behind **`can('star-transfer')`** — a grant only the backoffice
 * can give — and two of its pieces are behind something stricter: a receipt exists only after Star has
 * actually been sent, and a history row needs past transfers. So a design pass on either otherwise
 * means an agency account and real money. Same reason as `/dev/donate` and `/dev/earnings`.
 *
 * `StarTransferView` is deliberately **not** previewed: it owns the gate, three queries and two dialog
 * stacks, and a version of it that did not would be a second implementation of the screen with its own
 * drift. The same call `/dev/my-star` makes about `MyStarView`.
 *
 * ## The fixtures are **wire shapes**, run through the real parser
 *
 * `normalizeTransfers` is what production calls, so the preview cannot disagree with it about what a
 * payload means — a hand-written `Transfer` literal would happily carry a positive `stars` where the
 * wire sends `'-250'`, and the sign-stripping this screen relies on would go unexercised. It also
 * covers the two shapes worth looking at: a string amount and a missing `user`.
 */
export default function DevStarTransferPage() {
    if (process.env.NODE_ENV === 'production') notFound()
    return <Preview />
}

const HISTORY = normalizeTransfers([
    {
        id: 'TR-88213004',
        amount: '-250',
        fee: '0',
        description: 'Thanks for the collab!',
        created_at: '2026-08-18T09:20:00Z',
        user: { id: 1_002_884, display_name: 'Ada Lovelace' },
    },
    {
        id: 'TR-88212550',
        amount: '-12000',
        fee: '0',
        description: '',
        created_at: '2026-08-02T15:05:00Z',
        user: { id: 90_112, display_name: 'A creator with a rather long display name indeed' },
    },
    // No `user` on the wire: the movement is real and stays in the list, unnamed. See `Transfer.party`.
    { id: 'TR-88100001', amount: '-40', fee: '2', created_at: '2026-07-29T11:00:00Z' },
])

/**
 * What the CSV validation endpoint answers with, for a file with **five** lines: three good, one the
 * backend rejected, and one repeating a receiver already in the list.
 *
 * Those last two are the whole reason this fixture exists — the review screen's warning line and its
 * summing of repeated IDs are the two things about the bulk flow a reader has to be able to trust, and
 * they are invisible on a clean file.
 */
const TEMPLATE_ROWS: TemplateRow[] = [
    {
        party: { id: '1002884', name: 'Ada Lovelace', avatarUrl: null },
        amount: 250,
        errorFields: [],
    },
    {
        party: {
            id: '90112',
            name: 'A creator with a rather long display name indeed',
            avatarUrl: null,
        },
        amount: 12_000,
        errorFields: [],
    },
    { party: { id: '77120', name: 'Grace', avatarUrl: null }, amount: 500, errorFields: [] },
    // Rejected by the backend — counted in the warning, never sent.
    { party: null, amount: 0, errorFields: ['user'] },
    // A second line for Ada: summed into her row rather than sent twice.
    {
        party: { id: '1002884', name: 'Ada Lovelace', avatarUrl: null },
        amount: 100,
        errorFields: [],
    },
]

function Preview() {
    const [receipt, setReceipt] = useState<'none' | 'single' | 'batch'>('none')
    /*
     * The **real** flow hooks, not hand-built `flow` objects: the capability gates the screen and not
     * these, so the dialogs here run the shipped state machine, the shipped validation and the real
     * recipient lookup. A signed-out developer gets `invalid`/`error` from that lookup, which is two of
     * the five states worth looking at; the write is where `useRequireStars` correctly stops.
     */
    const single = useSingleTransfer()
    const multi = useMultiTransfer()
    const review = useBulkReviewPreview()

    return (
        <main className="mx-auto flex w-full max-w-[612px] flex-col gap-6 p-4">
            <h1 className="type-title-t1-semibold text-(--text-title)">Star transfer — parts</h1>

            <section className="flex flex-col gap-2">
                <h2 className="type-dense-strong text-(--text-body)">History rows</h2>
                <div className="overflow-hidden rounded-xl bg-(--background-surface)">
                    {HISTORY.map(transfer => (
                        <TransferHistoryRow
                            key={transfer.id}
                            transfer={transfer}
                            // The real thing: it opens the real single-transfer form with the ID in it.
                            onRetransfer={id => single.open(id)}
                        />
                    ))}
                </div>
            </section>

            <section className="flex flex-col gap-2">
                <h2 className="type-dense-strong text-(--text-body)">Features tiles</h2>
                {/* The real tiles, on the real panel surface, opening the real flows. */}
                <div className="rounded-xl bg-(--background-surface) p-3">
                    <TransferModeTiles onSingle={() => single.open()} onMulti={multi.open} />
                </div>
            </section>

            <section className="flex flex-col gap-2">
                <h2 className="type-dense-strong text-(--text-body)">Bulk review</h2>
                <div className="flex gap-2">
                    <Button variant="secondary" size="medium" onClick={review.review}>
                        Open with 5 CSV lines
                    </Button>
                </div>
                <p className="type-caption-meta text-(--text-subtitle)">
                    The only surface here nobody can reach: it is behind a validated CSV, which is
                    behind the grant and an upload the backend accepts. The fixture stands in for
                    the validation response; the plan itself is `planTransfers`, so the summing, the
                    dropped line and the warning count are the shipped rules.
                </p>
            </section>

            <section className="flex flex-col gap-2">
                <h2 className="type-dense-strong text-(--text-body)">Receipt (Transfer details)</h2>
                <div className="flex gap-2">
                    <Button variant="secondary" size="medium" onClick={() => setReceipt('single')}>
                        One receiver
                    </Button>
                    <Button variant="secondary" size="medium" onClick={() => setReceipt('batch')}>
                        Three receivers
                    </Button>
                </div>
                {/* A screen on the real route, so it previews inline here rather than as an overlay. */}
                {receipt !== 'none' && (
                    <TransferReceiptScreen
                        transfers={receipt === 'batch' ? HISTORY : HISTORY.slice(0, 1)}
                        onSendMore={() => setReceipt('none')}
                    />
                )}
            </section>

            <SingleTransferDialog flow={single} />
            <MultiTransferDialog flow={multi} />
            <MultiTransferDialog flow={review} />
        </main>
    )
}

/**
 * A `MultiTransferFlow` parked on its **review** step, with a plan built from `TEMPLATE_ROWS`.
 *
 * ## What is faked, and what is deliberately not
 *
 * Faked: the transport. There is no upload, no validation request and no write — `confirm` does nothing,
 * which is honest, because a harness must not be able to move Star.
 *
 * Not faked: **the plan**. `planTransfers` and `withoutReceiver` are the shipped functions, so the
 * amounts, the summed duplicate, the dropped line and the invalid count on screen are the ones
 * production would compute. That is the line `features/donation/dev.ts` draws about its own preview hook
 * — a harness that re-implements a feature's arithmetic previews the re-implementation.
 *
 * `selfId` is `null` here: dropping the reader's own row is a real rule and it is covered by
 * `transfer-rules.test.ts`, where it can be stated rather than looked at.
 */
function useBulkReviewPreview(): MultiTransferFlow {
    const [plan, setPlan] = useState(() => planTransfers(TEMPLATE_ROWS, null))
    const [step, setStep] = useState<MultiTransferFlow['step']>('closed')
    const [message, setMessage] = useState('For the September collab 🎉')

    return {
        step,
        file: null,
        fileProblem: null,
        uploadFailed: false,
        isValidating: false,
        isDownloading: false,
        plan,
        message,
        setMessage,
        canReview: plan.receivers.length > 0,
        isSending: false,
        receipt: [],
        open: () => setStep('upload'),
        close: () => setStep('closed'),
        chooseFile: () => undefined,
        clearFile: () => undefined,
        downloadTemplate: () => undefined,
        removeReceiver: id => setPlan(current => withoutReceiver(current, id)),
        review: () => {
            setPlan(planTransfers(TEMPLATE_ROWS, null))
            setStep('review')
        },
        back: () => setStep('closed'),
        confirm: () => undefined,
        sendMore: () => setStep('closed'),
    }
}
