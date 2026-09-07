'use client'

import { useTranslation } from '@shared/i18n/use-translation'
import { formatLedgerDateTime } from '@shared/lib/ledger-time'
import { formatAmountWithCode } from '@shared/lib/money'
import { cn } from '@shared/lib/utils'
import { Icon } from '@shared/ui/icon'
import {
    ListRow,
    ListRowAccessory,
    ListRowContent,
    ListRowLeading,
    ListRowRule,
    ListRowSubtitle,
    ListRowText,
    ListRowTitle,
    ListRowTitleRow,
    ListRowTrailing,
} from '@shared/ui/list'
import Link from 'next/link'
import type { PayoutRequest } from '../api/types'
import { humanisePayoutStatus, payoutStatus } from '../lib/payout-status'
import { payoutDetailPath } from '../routes'

/**
 * One payout request — `Payout request #1234` over its date, the net figure and its status opposite.
 *
 * ## Built from `ListRow`, not from `LedgerRow`
 *
 * The two look like the same row and are not: a ledger row's trailing slot is one amount, this one is
 * **two stacked lines that share a colour** — the figure and the status word are one statement, and
 * legacy paints both with the status ink for exactly that reason. Reusing `LedgerRow` would have meant
 * a second optional trailing line on a component two other screens depend on. The DS parts underneath
 * are the same ones, so the two lists still measure identically.
 *
 * ## A link, because it goes somewhere
 *
 * `/my-wallet/payout-tracking/{id}`. A real `<a>`, so it is middle-clickable and copyable and is
 * announced as a link — legacy puts `cursor: pointer` on a `Grid` and a `pushState` in its `onClick`,
 * which is neither. `ListRow`'s own doc makes the same distinction.
 *
 * ## The disc is 36px here, not the ledger's 40
 *
 * Legacy's own measurement, and it is the smaller list: no unit mark, no month of movements, a shorter
 * row. Matching the ledger's 40 would make two lists that are not the same list look like one.
 */
export function PayoutRequestRow({
    payout,
    /** Draw the hairline above this row — every row but the first in its group. */
    rule,
}: {
    payout: PayoutRequest
    rule?: boolean
}) {
    const { t, currentLanguage } = useTranslation()

    const status = payoutStatus(payout.status)
    /*
     * Neutral ink for a status this client does not know, with billy's own word for it — a payout the
     * reader cannot account for is worse than an unpolished label. Legacy does the same, except it
     * replaces only the first underscore.
     */
    const tone = status ? `text-(${status.tone})` : 'text-(--text-title)'
    const statusText = status ? t(status.label) : humanisePayoutStatus(payout.status)

    return (
        <ListRow
            data-testid="payout-row-link"
            data-payout-id={payout.id}
            /*
             * `Link`, not a bare `'a'`: this is an internal route, and a plain anchor would throw away
             * the router cache, the query cache and the scroll position on every press. Still a real
             * `<a>` underneath, so it stays middle-clickable, copyable and announced as a link —
             * legacy puts `cursor: pointer` on a `Grid` with a `pushState` in its handler, which is
             * none of those things.
             */
            as={Link}
            href={payoutDetailPath(payout.id)}
            rightAction
            className="cursor-pointer hover:bg-(--button-ghost-bg-hover)"
        >
            <ListRowLeading className="w-[44px]">
                {/*
                 * A **neutral** disc with the status glyph coloured inside it — legacy's `#F4F4F4`,
                 * which maps to `--background-segment`. Not the ledger's brand-tinted disc: there the
                 * tint *is* the decoration and every row carries it, while here the colour is the
                 * information (in progress / rejected / waiting), and a tinted ground competing with
                 * five different inks is what made the first pass of this row read as noisy.
                 */}
                <span
                    className={cn(
                        'flex size-[36px] flex-none items-center justify-center rounded-full',
                        'bg-(--background-segment)',
                        tone,
                    )}
                >
                    <Icon name={status?.icon ?? 'document-list'} size={18} />
                </span>
            </ListRowLeading>
            <ListRowContent>
                {rule && <ListRowRule />}
                <ListRowAccessory rightAction>
                    <ListRowText rightAction>
                        <ListRowTitleRow>
                            {/* `#` then the number, as legacy prints it. `truncate` so a long
                                request number cannot push the figure off the row. */}
                            <ListRowTitle className="truncate">
                                {t('payout_request_number', { number: payout.requestNumber })}
                            </ListRowTitle>
                        </ListRowTitleRow>
                        <ListRowSubtitle>
                            {formatLedgerDateTime(payout.createdAt, currentLanguage)}
                        </ListRowSubtitle>
                    </ListRowText>
                    {/*
                     * Both lines in the status ink, which is legacy's treatment and the right one: the
                     * figure and the word are a single claim about this request, and colouring only
                     * the word makes the amount look unrelated to whether it arrived.
                     */}
                    <ListRowTrailing className={cn('flex-col items-end gap-0', tone)}>
                        <span
                            // `dir="ltr"` for the reason `LedgerRow` gives: a figure in an RTL
                            // paragraph must stay one LTR run or its parts reorder.
                            dir="ltr"
                            className="type-dense-strong whitespace-nowrap"
                        >
                            {payout.netAmount === null
                                ? // `—`, not `0` — a zero is a claim about somebody's money. The
                                  // same answer `TotalBalanceCard` gives for an unknown balance.
                                  '—'
                                : formatAmountWithCode(
                                      payout.netAmount,
                                      payout.netAmountCurrency,
                                      currentLanguage,
                                  )}
                        </span>
                        <span className="type-caption-meta whitespace-nowrap">{statusText}</span>
                    </ListRowTrailing>
                </ListRowAccessory>
            </ListRowContent>
        </ListRow>
    )
}
