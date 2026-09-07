'use client'

import type { PayoutConfigRow } from '@features/payout'
import { PayoutMethodDetailDialog, PayoutMethodRow } from '@features/payout'
import { useState } from 'react'

/**
 * The saved-method rows and the dialog they open, from fixtures.
 *
 * `/my-wallet/payout-method` needs a signed-in creator who has already configured a payout
 * destination, so none of this is reachable in development: not the four-line row, not the `error`
 * status (which only the backend can set), not the missing daily limit, and not the per-method detail
 * table — which is the part most worth looking at, since it renders a different set of rows for every
 * method.
 *
 * The removal is inert here. It is a mutation against a real account, and the dialog's own confirm step
 * is what this harness exists to show; wiring a fake delete would only prove the fixture array can be
 * spliced.
 */
export function PayoutMethodPreview({ methods }: { methods: PayoutConfigRow[] }) {
    const [open, setOpen] = useState<PayoutConfigRow | null>(null)

    return (
        <>
            {/* The stack the real screen renders — cards on page colour with 12px between them, not
                rows inside a panel. See `PAYOUT_CARD`. */}
            <div className="flex flex-col gap-3">
                {methods.map(method => (
                    <PayoutMethodRow
                        key={method.id}
                        method={method}
                        onOpen={() => setOpen(method)}
                    />
                ))}
            </div>
            <PayoutMethodDetailDialog
                method={open}
                open={Boolean(open)}
                onOpenChange={next => {
                    if (!next) setOpen(null)
                }}
                isRemoving={false}
                onRemove={() => setOpen(null)}
            />
        </>
    )
}
