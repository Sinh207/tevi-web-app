'use client'

import { Collapsible } from '@base-ui/react/collapsible'
import { AnimatedAvatar } from '@shared/components/animated-avatar'
import { useTranslation } from '@shared/i18n/use-translation'
import { formatLedgerDateTime } from '@shared/lib/ledger-time'
import { formatStarAmount } from '@shared/lib/money'
import { cn } from '@shared/lib/utils'
import { Button } from '@shared/ui/button'
import { Icon } from '@shared/ui/icon'
import { useState } from 'react'
import type { Transfer } from '../api/types'
import { useSaveReceipt } from '../hooks/use-save-receipt'
import { CopyIdButton } from './copy-id-button'
import { StarAmount } from './star-mark'
import { TransferSummaryLine } from './transfer-details'

/**
 * One transfer in the history — legacy's accordion row, ported.
 *
 * Collapsed it is a plain row: a 36px disc with an outgoing arrow, the receiver's face, their name over
 * `ID: 1002884` with a copy button beside it, and the amount. Expanded it becomes a bordered box whose
 * header takes a filled background, with the transfer's five fields under it and **Retransfer** at the
 * bottom. All of that is `web-app`'s composition, including the two radii and where the fill lands.
 *
 * ## The trigger covers the row, and the copy button sits above it
 *
 * Legacy puts an `IconButton` inside the accordion's summary and stops the click propagating. That is a
 * button inside a button — invalid HTML, and browsers resolve it by swallowing one of the two presses
 * (MUI gets away with it by rendering `div`s). Here the toggle is an **absolutely positioned trigger
 * filling the row**, the visible content sits above it with `pointer-events-none`, and the copy button
 * takes its own pointer events back. Same behaviour, same picture, valid markup — and the trigger
 * carries a composed `aria-label`, since it has no text of its own.
 *
 * Open state is **controlled** rather than read back off base-ui's `data-*` attributes: the header fill,
 * the border and the chevron all depend on it, and one boolean in this component is less to keep in step
 * than three selectors reaching into a primitive's internals.
 *
 * ## Retransfer carries the ID and nothing else
 *
 * Not the amount and not the note: a repeat transfer is a *new* decision about how much, and pre-filling
 * the figure is how somebody sends 50,000 Star twice. **Save as PDF** beside it downloads this one row as
 * a receipt — see `lib/transfer-pdf.ts`.
 */
export function TransferHistoryRow({
    transfer,
    onRetransfer,
}: {
    transfer: Transfer
    onRetransfer: (teviId: string) => void
}) {
    const { t, currentLanguage } = useTranslation()
    const { save, saving } = useSaveReceipt()
    const [open, setOpen] = useState(false)
    const party = transfer.party
    const amount = formatStarAmount(-transfer.stars, currentLanguage)

    return (
        <Collapsible.Root
            open={open}
            onOpenChange={setOpen}
            className={cn(
                // `isolate` is load-bearing, not tidiness. This row stacks internally — the trigger sits at
                // `z-0` under content at `z-[1]` so the copy button can be pressed over it — and without a
                // stacking context of its own those numbers compete with the **day header** above the list,
                // which is also `z-[1]` and comes *earlier* in the DOM. The row won, so a sticky date label
                // was painted over by the rows scrolling under it.
                'isolate overflow-hidden rounded-lg',
                // Legacy's expanded box: a 1px edge in the panel's own separator tone.
                open && 'border border-(--separator-default)',
            )}
        >
            <div className={cn('relative', open && 'bg-(--background-segment)')}>
                {/*
                 * The whole row toggles. `aria-label` is composed because the trigger has no text of its
                 * own — the visible content is a sibling, so that it can host the copy button.
                 */}
                <Collapsible.Trigger
                    aria-label={[party?.name || party?.id, amount].filter(Boolean).join(' · ')}
                    className="absolute inset-0 z-0 w-full cursor-pointer rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--focus-ring)"
                />
                <div className="pointer-events-none relative z-[1] flex items-center gap-2 p-2">
                    {/*
                     * The 36px disc with the outgoing arrow — every row here is a transfer *out*, so the
                     * glyph is the list's subject rather than a per-row type. Legacy draws the same disc
                     * at the same size in front of the avatar.
                     */}
                    <span className="flex size-9 flex-none items-center justify-center rounded-full bg-(--background-segment) text-(--text-title)">
                        <Icon name="arrow-up-right" size={20} />
                    </span>
                    {party ? (
                        <>
                            <AnimatedAvatar
                                thumb={party.avatarUrl}
                                isPremium={false}
                                alt={party.name || party.id}
                                size="small"
                            />
                            <span className="flex min-w-0 flex-auto flex-col">
                                {party.name && (
                                    <span className="type-dense-emphasis truncate text-(--text-title)">
                                        {party.name}
                                    </span>
                                )}
                                <span className="type-dense-default flex items-center gap-1 text-(--text-subtitle)">
                                    <span className="truncate">
                                        {t('star_transfer_tevi_id')}: {party.id}
                                    </span>
                                    {/* Pointer events back on, so this is pressable over the trigger. */}
                                    <CopyIdButton
                                        value={party.id}
                                        className="pointer-events-auto relative z-[2]"
                                    />
                                </span>
                            </span>
                        </>
                    ) : (
                        /*
                         * A transfer whose counterparty the payload did not carry. The movement is real and
                         * stays in the list — its date identifies it — because a history that silently omits
                         * rows is worse than one with an unnamed row in it.
                         */
                        <span className="type-dense-default min-w-0 flex-auto truncate text-(--text-subtitle)">
                            {formatLedgerDateTime(transfer.createdAt, currentLanguage)}
                        </span>
                    )}
                    {/*
                     * Negated for display, **not** prefixed with a literal minus: the sign comes out of
                     * `Intl`, which is the rule `formatLedgerAmount` states — a hard-coded `−` lands on the
                     * wrong side of the figure in RTL. `Transfer.stars` is absolute by design; this row is
                     * the one place that knows the movement is outgoing.
                     */}
                    <StarAmount
                        value={-transfer.stars}
                        size={16}
                        className="flex-none"
                        figureClassName="type-body-strong"
                    />
                    <Icon
                        name="angle-down"
                        size={16}
                        aria-hidden
                        className={cn(
                            'flex-none text-(--text-subtitle) transition-transform duration-200',
                            open && 'rotate-180',
                        )}
                    />
                </div>
            </div>

            {/*
             * base-ui's measured height (`--collapsible-panel-height`) is the only way to animate to
             * `auto`; `overflow-hidden` keeps the contents clipped during the 200ms rather than spilling
             * over the row below.
             */}
            <Collapsible.Panel className="h-(--collapsible-panel-height) overflow-hidden transition-[height] duration-200 data-[ending-style]:h-0 data-[starting-style]:h-0">
                <div className="flex flex-col gap-2 p-3">
                    <TransferSummaryLine
                        label={t('star_transfer_transfer_id')}
                        value={
                            <span className="flex items-center gap-1">
                                <span className="break-all">{transfer.id}</span>
                                <CopyIdButton value={transfer.id} />
                            </span>
                        }
                    />
                    <TransferSummaryLine
                        label={t('star_transfer_transfer_time')}
                        value={formatLedgerDateTime(transfer.createdAt, currentLanguage)}
                    />
                    {transfer.description && (
                        <TransferSummaryLine
                            label={t('star_transfer_message')}
                            value={transfer.description}
                        />
                    )}
                    <TransferSummaryLine
                        label={t('star_transfer_star_to_transfer')}
                        value={<StarAmount value={transfer.stars} />}
                    />
                    <TransferSummaryLine
                        label={t('star_transfer_fee')}
                        value={<StarAmount value={transfer.fee} />}
                    />
                    {/*
                     * Legacy's action row: its own top hairline, and two pill buttons. **Save as PDF** is
                     * offered even on a row whose counterparty the payload did not carry — the receipt is
                     * about the transfer, and the ID, the time, the amount and the fee are all there.
                     */}
                    <div className="flex justify-end gap-2 border-(--separator-default) border-t pt-3">
                        {party && (
                            <Button
                                data-testid="star-transfer-history-retransfer"
                                variant="secondary"
                                size="small"
                                className="rounded-full"
                                onClick={() => onRetransfer(party.id)}
                            >
                                {t('star_transfer_retransfer')}
                            </Button>
                        )}
                        <Button
                            data-testid="star-transfer-history-save"
                            variant="accent"
                            size="small"
                            className="rounded-full"
                            disabled={saving}
                            onClick={() => void save([transfer])}
                        >
                            {t('star_transfer_save_pdf')}
                        </Button>
                    </div>
                </div>
            </Collapsible.Panel>
        </Collapsible.Root>
    )
}
