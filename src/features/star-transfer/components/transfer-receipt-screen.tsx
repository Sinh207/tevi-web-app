'use client'

import { StarMark } from '@shared/components/star-mark'
import { useTranslation } from '@shared/i18n/use-translation'
import { formatLedgerDateTime } from '@shared/lib/ledger-time'
import { formatStarAmount } from '@shared/lib/money'
import { Button } from '@shared/ui/button'
import Image from 'next/image'
import type { Transfer, TransferParty } from '../api/types'
import { useSaveReceipt } from '../hooks/use-save-receipt'
import { useSelfParty } from '../hooks/use-self-party'
import { STAR_TRANSFER_ART } from '../lib/illustrations'
import { CopyIdButton } from './copy-id-button'
import { StarAmount } from './star-mark'
import { TransferSummaryLine } from './transfer-details'

/**
 * The receipt — **a screen, as `web-app` has it**, not a dialog.
 *
 * ## Why it stopped being a dialog
 *
 * It was one, on the argument that a receipt is the third step of a flow and closing it should reveal the
 * screen behind. Legacy disagrees, and legacy is the specification here: `containers/starTransfer` has
 * three page states — the transfer screen, the full history, and **Transfer details** — and the receipt is
 * the third. The page's back bar takes its title, and Back returns to the transfer screen rather than
 * leaving the route (`StarTransferView` owns that, exactly as legacy's `IconBtnBack` does).
 *
 * It matters more than the container: a receipt is a document somebody may want to keep, screenshot or
 * read twice, and a modal over a dimmed page is the wrong frame for that.
 *
 * ## Every figure comes from the server
 *
 * The total is summed over the records, the time is the record's `created_at`, the fee is the record's
 * `fee`. Nothing is carried over from the form, which is what makes this a receipt rather than a summary
 * of what was asked for: if the backend applied a fee or adjusted an amount, the reader sees what
 * actually happened.
 *
 * ## The transfer ID appears for a **single** transfer only
 *
 * A batch has one ID per receiver, and legacy prints `listTransfer[0].id` as though it were the ID of the
 * whole thing — so a reader quoting it to support is quoting one of forty records. Here a batch shows its
 * receivers with their own amounts, and the per-transfer IDs are one screen away in the history, where
 * each record is its own row and its ID can be copied.
 *
 * **Save as PDF** sits beside *Send more*, as it does in legacy — `lib/transfer-pdf.ts` draws it.
 */
export function TransferReceiptScreen({
    transfers,
    onSendMore,
}: {
    transfers: Transfer[]
    /** Back to an empty form of the flow this receipt came from. Legacy's "Send more". */
    onSendMore: () => void
}) {
    const { t, currentLanguage } = useTranslation()
    const self = useSelfParty()
    const { save, saving } = useSaveReceipt()

    // The flows only reach this screen with records in hand, so this is the impossible case rather than a
    // state — and an empty receipt would be worse than none.
    if (transfers.length === 0) return null

    const total = transfers.reduce((sum, transfer) => sum + transfer.stars, 0)
    const fee = transfers.reduce((sum, transfer) => sum + transfer.fee, 0)
    const first = transfers[0]
    const single = transfers.length === 1 ? first : null

    return (
        <div className="flex flex-1 flex-col gap-4 bg-(--background-surface) p-4 md:rounded-xl">
            {/* ── The outcome, centred, as legacy stacks it ─────────────────────────────── */}
            <div className="flex flex-col items-center gap-1 text-center">
                <Image
                    src={STAR_TRANSFER_ART.success.src}
                    alt=""
                    aria-hidden
                    width={STAR_TRANSFER_ART.success.width}
                    height={STAR_TRANSFER_ART.success.height}
                    className="h-auto"
                    priority
                />
                <h2 className="type-title-t2-semibold text-(--text-title)">
                    {t('star_transfer_receipt_title')}
                </h2>
                <p className="type-caption-meta text-(--text-subtitle)">
                    {t('star_transfer_receipt_total')}
                </p>
                <span className="flex items-center gap-2.5">
                    <StarMark size={32} />
                    <span className="type-title-t1-semibold text-(--text-title) tabular-nums">
                        {formatStarAmount(total, currentLanguage)}
                    </span>
                </span>
            </div>

            {/* Legacy's dashed rule between the outcome and the paperwork. */}
            <hr className="border-(--separator-default) border-t border-dashed" />

            <section className="flex flex-col gap-2">
                <h3 className="type-body-strong text-(--text-title)">
                    {t('star_transfer_receipt_summary')}
                </h3>
                <div className="flex flex-col gap-2">
                    {single && (
                        <TransferSummaryLine
                            label={t('star_transfer_transfer_id')}
                            value={single.id}
                            copy={single.id}
                        />
                    )}
                    <TransferSummaryLine
                        label={t('star_transfer_receipt_fee')}
                        value={<StarAmount value={fee} />}
                    />
                    <TransferSummaryLine
                        label={t('star_transfer_transfer_time')}
                        value={formatLedgerDateTime(first.createdAt, currentLanguage)}
                    />
                    {single?.description && (
                        <TransferSummaryLine
                            label={t('star_transfer_message')}
                            value={single.description}
                        />
                    )}
                </div>
            </section>

            {self && (
                <section className="flex flex-col gap-2">
                    <h3 className="type-body-strong text-(--text-title)">
                        {t('star_transfer_sender')}
                    </h3>
                    <PartyCard party={self} />
                </section>
            )}

            <section className="flex flex-col gap-2">
                <h3 className="type-body-strong text-(--text-title)">
                    {t('star_transfer_receiver')}
                </h3>
                {transfers.map(transfer => (
                    <PartyCard
                        key={transfer.id}
                        party={transfer.party}
                        fallbackId={transfer.id}
                        /*
                         * The per-receiver amount, on a batch only — legacy's own condition. On a single
                         * transfer the figure at the top of the screen is already that number, and printing
                         * it twice twelve pixels apart reads as a template nobody looked at.
                         */
                        amount={single ? undefined : transfer.stars}
                    />
                ))}
            </section>

            {/*
             * Legacy's two actions, in its order. A batch downloads **one document with a page per
             * receiver** rather than one file each — see `lib/transfer-pdf.ts` for why.
             */}
            <div className="flex justify-end gap-2">
                <Button
                    data-testid="star-transfer-receipt-save"
                    variant="secondary"
                    size="medium"
                    className="rounded-full"
                    disabled={saving}
                    onClick={() => void save(transfers)}
                >
                    {t('star_transfer_save_pdf')}
                </Button>
                <Button
                    data-testid="star-transfer-receipt-again"
                    variant="accent"
                    size="medium"
                    className="rounded-full"
                    onClick={onSendMore}
                >
                    {t('star_transfer_send_more')}
                </Button>
            </div>
        </div>
    )
}

/**
 * A party on the receipt: a bordered card with **Tevi ID** and **Username** as two labelled columns.
 *
 * Legacy's table, kept rather than replaced with the avatar row the review screens use. A receipt is
 * paperwork — the two fields are what somebody transcribes or quotes, and labelling them is what makes an
 * ID copied off this screen unambiguous. The review screens are the opposite case: there the reader is
 * checking *who* they are about to pay, and a face answers that faster than a label.
 *
 * A record whose `user` the payload did not carry still gets a card, identified by its transfer ID —
 * skipping it would leave the listed receivers adding up to less than the total printed above.
 */
function PartyCard({
    party,
    fallbackId,
    amount,
}: {
    party: TransferParty | null
    fallbackId?: string
    /** Star for this receiver — a **number**; `StarAmount` formats it. Omit on a single transfer. */
    amount?: number
}) {
    const { t } = useTranslation()

    return (
        <div className="flex flex-col gap-2 rounded-lg border border-(--separator-default) border-dashed p-3">
            <div className="flex min-w-0 items-start justify-between gap-3">
                <span className="flex min-w-0 flex-col gap-0.5">
                    <span className="type-caption-meta text-(--text-subtitle)">
                        {t('star_transfer_tevi_id')}
                    </span>
                    <span className="type-dense-default flex items-center gap-1.5 text-(--text-title)">
                        <span className="min-w-0 break-all">{party?.id ?? fallbackId ?? '—'}</span>
                        {party && <CopyIdButton value={party.id} />}
                    </span>
                </span>
                <span className="flex min-w-0 flex-col gap-0.5">
                    <span className="type-caption-meta text-(--text-subtitle)">
                        {t('star_transfer_username')}
                    </span>
                    <span className="type-dense-default truncate text-(--text-title)">
                        {party?.name || '—'}
                    </span>
                </span>
            </div>
            {amount !== undefined && <StarAmount value={amount} className="self-end" />}
        </div>
    )
}
