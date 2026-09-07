'use client'

import type { PayoutRequestDetail } from '@features/payout'
import {
    PayoutAmountRows,
    PayoutConfigRows,
    PayoutDisclosure,
    PayoutStatusChip,
    PayoutTimeline,
} from '@features/payout'
import { formatAmountWithCode } from '@shared/lib/money'

/**
 * The detail screen's body, from a fixture — the real one needs a signed-in creator who has requested a
 * payout, so the folds, the fee arithmetic and the timeline are otherwise unreachable in dev.
 *
 * **Three cards on the page colour**, which is legacy's own arrangement: its 5px `#F4F4F4` "dividers"
 * are the gaps between separate `Paper`s. The screen ships both folds closed; a design pass clicks them.
 */
export function PayoutDetailPreview({ request }: { request: PayoutRequestDetail }) {
    return (
        <div className="flex flex-col gap-3">
            <div className="flex flex-col overflow-clip rounded-xl bg-(--background-surface) px-4">
                <div className="flex flex-col items-center gap-1 px-2 py-8 text-center">
                    <p dir="ltr" className="type-heading-h1-bold m-0 text-(--text-title)">
                        {request.netAmount === null
                            ? '—'
                            : formatAmountWithCode(
                                  request.netAmount,
                                  request.netAmountCurrency,
                                  'en',
                              )}
                    </p>
                    <p className="type-dense-default m-0 text-(--text-body)">Withdraw request</p>
                </div>
                <div className="flex flex-col border-(--separator-default) border-t py-2">
                    <PayoutDisclosure
                        label="Status"
                        summary={<PayoutStatusChip request={request} />}
                    >
                        <PayoutTimeline request={request} />
                    </PayoutDisclosure>
                </div>
            </div>

            <div className="flex flex-col overflow-clip rounded-xl bg-(--background-surface) px-4 py-2">
                <PayoutConfigRows request={request} />
            </div>

            <div className="flex flex-col overflow-clip rounded-xl bg-(--background-surface) px-4">
                <PayoutDisclosure label="Show withdraw detail" defaultOpen>
                    <PayoutAmountRows request={request} />
                </PayoutDisclosure>
            </div>
        </div>
    )
}
