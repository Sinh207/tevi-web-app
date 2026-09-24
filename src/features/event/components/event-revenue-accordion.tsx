'use client'

import { cn } from '@shared/lib/utils'
import { Icon } from '@shared/ui/icon'
import { type ReactNode, useId, useState } from 'react'
import type { EventBill } from '../api/report-types'
import { formatRevenue, mcnCommission, toAmount } from '../lib/event-revenue'

/**
 * One half of the revenue summary: **a tinted header with the net figure, opening onto the lines
 * that make it up.**
 *
 * Legacy has two of these — `liveRevenue` and `interactiveRevenue` — as ~340 and ~290 line files
 * that are the same accordion, the same 46px tinted summary bar, the same dashed dividers, and the
 * same three closing rows (*Subtotal*, *MCN commission*, *Service fee*) copied verbatim. The only
 * real difference is **which lines go in the middle**, and that is what `children` is.
 *
 * ## `<details>`, not a JS accordion
 *
 * Open by default, as legacy's is (`defaultExpanded`), and the DS ships no accordion — so rather
 * than invent one this is the element the platform already has: keyboard-operable, findable by the
 * browser's in-page search **while collapsed**, and correct with no JavaScript. The one thing it
 * needs help with is the chevron, which rotates off `[open]`.
 *
 * ⚠ `group-open:rotate-180` and not a `transform` on the parent: Tailwind v4 sets `rotate` as an
 * individual transform property, so `transition-[transform]` animates nothing and
 * `getComputedStyle().transform` reads `none`. The transition is on `rotate` for that reason.
 *
 * ## ⚠ The tinted bar is `--background-segment`, and `--background-subtle` is the trap
 *
 * Legacy paints the summary `#FAF8FF`, a pale tint that separates the header from the lines under
 * it. This used `--background-subtle`, which **is `#18181b` in Dark — byte-identical to
 * `--background-surface`**, the card it sits on. So in dark mode the bar had no tint at all: the
 * accordion header and its body were one undifferentiated block, and the only thing marking the
 * header was its chevron.
 *
 * `--background-segment` differs from surface in **both** modes (`#edeeef` / `#1e1e20`), which is
 * why the DS uses it for a segmented track and why `NsfwGatePanel` reaches for it. Measured, not
 * assumed — and `MY_WALLET_SCREEN` carries the same warning about the same token.
 *
 * ## The three closing rows are here because they are always the same three
 *
 * *Subtotal* is the category's `amount`, *Service fee* its `fee`, and *MCN commission* appears only
 * when it is above zero — legacy's own condition (`commissionMcnAmount > 0`), which is worth keeping
 * rather than showing `-$0` to every creator who is not in a network.
 *
 * Both deductions are drawn in the error accent with a leading `−`. ⚠ **`--accents-error-active` is
 * a mark colour, not a sentence colour** — it fails AA on light backgrounds for body copy — but a
 * short numeric figure at 14/400 is exactly what it is for, and the pairing here is ink-on-surface
 * rather than the tinted pair a `Badge` uses. The figure is also never the *only* signal: the `−`
 * and the row's label both say what it is.
 */
export function EventRevenueAccordion({
    title,
    bill,
    locale,
    labels,
    children,
    testId,
}: {
    title: string
    bill: EventBill | null
    locale: string
    /** The three closing rows' copy, resolved by the caller so this stays presentational. */
    labels: { subtotal: string; mcn: string; serviceFee: string }
    /** The category's own lines. */
    children: ReactNode
    testId?: string
}) {
    const [open, setOpen] = useState(true)
    const bodyId = useId()

    const net = toAmount(bill?.net_amount)
    const subtotal = toAmount(bill?.amount)
    const fee = toAmount(bill?.fee)
    const mcn = mcnCommission(bill)

    return (
        <details
            data-testid={testId}
            open={open}
            onToggle={event => setOpen((event.currentTarget as HTMLDetailsElement).open)}
            className="group min-w-0 rounded-(--radius-lg)"
        >
            {/*
             * `list-none` plus the WebKit pseudo-element: Safari draws its own disclosure triangle
             * on a `<summary>` and it is not removed by `list-style` alone.
             */}
            <summary
                className={cn(
                    'flex h-[46px] min-w-0 cursor-pointer list-none items-center gap-2 rounded-(--radius-md) px-3',
                    'bg-(--background-segment) [&::-webkit-details-marker]:hidden',
                    'group-open:rounded-b-none',
                )}
                aria-controls={bodyId}
            >
                <span className="type-dense-default min-w-0 truncate text-(--text-title)">
                    {title}
                </span>
                <span className="type-dense-strong ms-auto text-(--text-link)">
                    {formatRevenue(net, locale)}
                </span>
                <Icon
                    name="angle-down"
                    size={20}
                    className="flex-none rotate-0 text-(--icon-secondary) transition-[rotate] duration-200 group-open:rotate-180"
                />
            </summary>

            <div id={bodyId} className="flex min-w-0 flex-col gap-3 px-3 pt-3 pb-1">
                {children}

                <DashedRule />

                <RevenueRow
                    label={labels.subtotal}
                    value={formatRevenue(subtotal, locale)}
                    strong
                />

                {mcn !== null && (
                    <RevenueRow
                        label={labels.mcn}
                        value={`-${formatRevenue(mcn, locale)}`}
                        negative
                    />
                )}

                <RevenueRow
                    label={labels.serviceFee}
                    value={`-${formatRevenue(fee, locale)}`}
                    negative
                />
            </div>
        </details>
    )
}

/** Legacy's dashed `Divider`, which reads as "a total follows" rather than "a section ends". */
function DashedRule() {
    return <hr className="border-t border-dashed border-(--separator-default)" />
}

/**
 * One row of a bill: a label, an optional quantity, and a figure at the trailing edge.
 *
 * Legacy lays these out on a 12-column MUI grid whose split *changes at `md`* (6/2/4 below, 4/2/6
 * above) — 60 lines of `size={{ xs: 6, sm: 6, md: 4, … }}` per row, five times over, to move the
 * quantity column. Flex does the same thing with no breakpoints: the label takes the space it needs
 * and truncates, the quantity is intrinsic, the figure is pinned to the end. The columns line up
 * across rows because the figure is right-aligned rather than because a grid says so.
 */
export function RevenueRow({
    label,
    quantity,
    value,
    strong,
    negative,
    onInfo,
    infoLabel,
}: {
    label: string
    /** `x12`, already formatted. Omitted on the closing rows, which have no quantity. */
    quantity?: string
    value: string
    /** *Subtotal* — the one middle row that is a figure of its own rather than a line item. */
    strong?: boolean
    /** A deduction: the error accent and a leading `−`, which the caller supplies. */
    negative?: boolean
    /** A `?` beside the label. *Sustained viewers* has one in legacy. */
    onInfo?: () => void
    infoLabel?: string
}) {
    return (
        <div className="flex min-w-0 items-baseline gap-2">
            <span
                className={cn(
                    'type-dense-default flex min-w-0 items-center gap-1 truncate',
                    strong ? 'text-(--text-title)' : 'text-(--text-subtitle)',
                )}
            >
                <span className="min-w-0 truncate">{label}</span>
                {onInfo && (
                    <button
                        type="button"
                        aria-label={infoLabel ?? label}
                        onClick={onInfo}
                        className="flex size-4 flex-none items-center justify-center text-(--icon-secondary) transition-colors hover:text-(--text-title)"
                    >
                        <Icon name="question-circle" size={16} />
                    </button>
                )}
            </span>
            {quantity && (
                <span className="type-dense-default flex-none text-(--text-title)">
                    ×{quantity}
                </span>
            )}
            {/*
             * `tabular-nums` so the figures form a column — the one thing legacy's grid did buy, and
             * the reason it is worth stating: proportional digits make `$1,234.5` and `$60` misalign
             * even when both are right-aligned.
             */}
            <span
                className={cn(
                    'ms-auto flex-none tabular-nums',
                    negative
                        ? 'type-dense-default text-(--accents-error-active)'
                        : 'type-dense-strong text-(--text-title)',
                )}
            >
                {value}
            </span>
        </div>
    )
}
