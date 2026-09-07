'use client'

import type { CheckoutOrder, CheckoutState } from '@features/payment'
import { CheckoutStatusDialog } from '@features/payment'
import { Button } from '@shared/ui/button'
import { useState } from 'react'

const ORDER: CheckoutOrder = { kind: 'stars', gatewayId: 'gw.stripe', quantity: 1000 }

/**
 * Every state the dialog draws, plus the three `type` values that change the success copy — the
 * distinction a screenshot of one success cannot show.
 */
const STATES: { label: string; state: CheckoutState }[] = [
    { label: 'confirming', state: { kind: 'confirming', order: ORDER, clientSecret: 'pi_1' } },
    { label: 'settling', state: { kind: 'settling', order: ORDER, settleRef: 'pi_1', attempt: 3 } },
    { label: 'slow', state: { kind: 'slow', order: ORDER, settleRef: 'pi_1' } },
    { label: 'succeeded · star', state: { kind: 'succeeded', order: ORDER, purchaseType: 'star' } },
    {
        label: 'succeeded · subscription',
        state: { kind: 'succeeded', order: ORDER, purchaseType: 'subscription' },
    },
    {
        label: 'succeeded · direct_donation',
        state: { kind: 'succeeded', order: ORDER, purchaseType: 'direct_donation' },
    },
    {
        label: 'failed · backend sentence',
        state: {
            kind: 'failed',
            order: ORDER,
            messageKey: 'payment_error_generic',
            text: 'Your card was declined.',
        },
    },
    {
        /*
         * A failure resumed from a URL after a 3DS redirect: the page reloaded, so there is no order
         * and nothing to restart. Here because the difference is a **button** — Try again cannot be
         * offered for something the client no longer knows — and that is only visible side by side.
         */
        label: 'failed · resumed (no order)',
        state: {
            kind: 'failed',
            order: null,
            messageKey: 'payment_error_generic',
            text: null,
        },
    },
]

export function StatusPreview() {
    const [shown, setShown] = useState<number | null>(null)

    return (
        <>
            <div className="flex flex-wrap gap-2">
                {STATES.map((entry, index) => (
                    <Button
                        key={entry.label}
                        variant="secondary"
                        size="medium"
                        onClick={() => setShown(index)}
                    >
                        {entry.label}
                    </Button>
                ))}
            </div>

            {shown !== null && (
                <CheckoutStatusDialog
                    /* Keyed so pressing a second state remounts rather than transitioning between two. */
                    key={shown}
                    state={STATES[shown]?.state ?? { kind: 'idle' }}
                    onClose={() => setShown(null)}
                    onRetry={() => setShown(null)}
                    onBuyMore={() => setShown(null)}
                />
            )}
        </>
    )
}
