'use client'

import { StarMark } from '@shared/components/star-mark'
import { useTranslation } from '@shared/i18n/use-translation'
import { formatStarAmount } from '@shared/lib/money'
import { cn } from '@shared/lib/utils'
import type { ReactNode } from 'react'
import type { TransferParty as Party } from '../api/types'
import { CopyIdButton } from './copy-id-button'
import { TransferParty } from './transfer-party'

/**
 * The parts a transfer is *stated* in — the figure, the card the fields sit in, and the two
 * label-and-value shapes.
 *
 * They live together because they are one idea at four sizes — *"here is what this transfer says"* — and
 * because the screens that use them have to read as the same document: somebody who checks a transfer on
 * the review screen and then reads the receipt should recognise every row.
 *
 * ## The rule these encode
 *
 * A review screen is a **statement**, not a form, and a statement has a shape: one figure at the top, then
 * the fields it is made of inside a single bordered card with hairlines between them. Before this the
 * review screens were flat text on the dialog's own sheet — heading, heading, label, value, label, value,
 * down the page with nothing containing anything — which is legible and reads as unfinished. Nothing was
 * added to say it: the same rows, one card and one figure block.
 *
 * Short values (a fee, a timestamp) go in a two-column `TransferSummaryLine`; a written note goes in a
 * stacked `TransferDetailRow`, because a sender's 128 characters right-aligned against a label is a ragged
 * paragraph. That split is the whole reason both shapes exist.
 */

/**
 * The figure a review screen is about: its label, then the total, in a card of its own.
 *
 * `tone="error"` is the bulk flow's unaffordable total (a CSV can add up to more than the balance, and
 * there is no field to refuse it on the way in); `note` is the sentence that then explains it. The 32px
 * mark and Title typography are deliberately *not* routed through `StarAmount` — see the note there.
 */
export function TransferAmountHero({
    label,
    value,
    tone = 'default',
    note,
}: {
    label: string
    value: number
    tone?: 'default' | 'error'
    note?: ReactNode
}) {
    const { currentLanguage } = useTranslation()

    return (
        <div className="flex flex-col gap-1 rounded-xl border border-(--separator-default) bg-(--background-elevated) p-3">
            <span className="type-caption-meta text-(--text-subtitle)">{label}</span>
            <span className="flex items-center gap-2.5">
                <StarMark size={32} />
                <span
                    className={cn(
                        'type-title-t1-semibold tabular-nums',
                        tone === 'error' ? 'text-(--text-error)' : 'text-(--text-title)',
                    )}
                >
                    {formatStarAmount(value, currentLanguage)}
                </span>
            </span>
            {note}
        </div>
    )
}

/**
 * The card the fields are stated in — one border, one hairline between each row.
 *
 * **Its children are rows and it pads them itself** (`[&>*]:p-3`), which is the one thing worth explaining
 * here: the alternative is a `TransferInfoRow` wrapper around every child, and with a From block, a To
 * header, ten receivers and four fields that is fourteen wrappers whose only job is `p-3`. The rows are
 * whatever the screen puts in — a party block, a receiver with an amount, a summary line — and the card
 * makes them a list.
 *
 * `overflow-hidden` so the first and last rows are clipped to the radius, and the fill is
 * **`--background-elevated`, not Surface** — the trap `membership-detail-dialog.tsx` documents at
 * length: the DS `Dialog` is `--background-subtle`, and in **dark** Subtle and Surface are the same
 * `#18181b`, so a Surface card inside a dialog is invisible in one theme only. Elevated is
 * `--white` / `#222225` — a real step up in both, and what every other floating thing in this app uses.
 */
export function TransferInfoCard({
    children,
    className,
}: {
    children: ReactNode
    className?: string
}) {
    return (
        <div
            className={cn(
                'flex flex-col divide-y divide-(--separator-default) overflow-hidden rounded-xl border border-(--separator-default) bg-(--background-elevated)',
                '[&>*]:p-3',
                className,
            )}
        >
            {children}
        </div>
    )
}

/** A titled party block — **From** / **To**, **Sender** / **Receiver**. */
export function TransferPartyBlock({
    label,
    party,
    trailing,
}: {
    label: string
    party: Party
    trailing?: ReactNode
}) {
    return (
        <div className="flex min-w-0 flex-col gap-1">
            <span className="type-caption-meta text-(--text-subtitle)">{label}</span>
            <TransferParty party={party} trailing={trailing} />
        </div>
    )
}

/**
 * One field of a transfer: its name, then its value.
 *
 * Stacked rather than laid out as a two-column row, and that is the decision worth stating. The values
 * here are a transfer ID (long, and worth being able to select in one go), a note the sender wrote
 * (arbitrary length), and a formatted date. In a two-column row all three either truncate or wrap against
 * the label — and a truncated transfer ID is worse than useless, because it looks like a whole one.
 *
 * The two-column sibling is `TransferSummaryLine` below.
 *
 * `break-words` for the same reason: an ID pasted from somewhere else must not push the surface wider than
 * the viewport.
 */
export function TransferDetailRow({
    label,
    value,
    className,
}: {
    label: string
    value: ReactNode
    className?: string
}) {
    return (
        <div className={cn('flex min-w-0 flex-col gap-0.5', className)}>
            <span className="type-caption-meta text-(--text-subtitle)">{label}</span>
            <span className="type-dense-default break-words text-(--text-title)">{value}</span>
        </div>
    )
}

/**
 * The same field as a **two-column row** — label left, value right — which is how legacy lays out the
 * expanded history row and the receipt's summary.
 *
 * Two shapes rather than one with a `layout` prop, because they are two *densities* and each has a real
 * constraint: the stacked one above holds a note of any length, this one holds an ID, a figure or a short
 * date and is read as a table beside its neighbours.
 *
 * It lives here, next to its sibling, because it was written **twice** — once in the receipt screen and
 * once in the history row, identical but for the copy glyph. That is the drift this feature's own docs
 * criticise legacy for (two ledger components, ~300 lines each, already diverged), and two files is where
 * it starts.
 *
 * `min-w-0` on the value so a long transfer ID wraps inside its column instead of pushing the label off
 * the row.
 */
export function TransferSummaryLine({
    label,
    value,
    /** Show a copy glyph after the value — pass the string to copy. */
    copy,
}: {
    label: string
    value: ReactNode
    copy?: string
}) {
    return (
        <div className="flex items-start justify-between gap-3">
            <span className="type-caption-meta flex-none text-(--text-subtitle)">{label}</span>
            <span className="type-dense-default flex min-w-0 items-center gap-1.5 text-end text-(--text-title)">
                <span className="min-w-0 break-all">{value}</span>
                {copy && <CopyIdButton value={copy} />}
            </span>
        </div>
    )
}
