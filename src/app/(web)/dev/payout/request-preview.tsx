'use client'

import { PayoutOptionCards, PayoutRequestSummary } from '@features/payout/dev'
import { useEffect, useState } from 'react'
import { DEV_PAYOUT_OPTIONS, DEV_PAYOUT_QUOTE } from './fixtures'

/**
 * The request screen's two interactive blocks — the speed cards and the fee breakdown.
 *
 * Client, and stateful, because the point of previewing them is the **presses**: three help dialogs
 * (*What is Premium?* on the Fast card, the payout- and transaction-fee explainers in the breakdown)
 * and the Premium sell a locked Fast card raises. All four are unreachable otherwise — see
 * `features/payout/dev.ts`.
 *
 * `canOffer={false}`: the sell opens by itself on arrival for an account without Premium, which on a
 * harness page means a dialog over the thing being inspected every time it loads. A deliberate press
 * on the locked card still opens it.
 *
 * ## ⚠ Mounted **after hydration**, and the harness is the only place that needs saying
 *
 * The Saving card's *Get by* line is `Intl.DateTimeFormat.formatRange` over `Date.now()`, so it is a
 * hydration mismatch twice over: Node and Chromium put different separators inside the collapsed range
 * (the trap `shared/components/calendar-lazy.tsx` exists for), and the two renders happen at different
 * instants besides. On the real screen the cards never server-render — `options` arrives from a client
 * query and `PayoutOptionCards` returns `null` while the list is empty — so this is a property of
 * previewing them from a server component, not a defect in the component. Rendering them on the client
 * only is what the real screen does anyway.
 */
export function PayoutRequestPreview() {
    const [selected, setSelected] = useState<string | null>('saving')
    const [mounted, setMounted] = useState(false)
    useEffect(() => setMounted(true), [])

    if (!mounted) return null

    return (
        <div className="flex flex-col gap-3">
            <PayoutOptionCards
                options={DEV_PAYOUT_OPTIONS}
                selectedId={selected}
                onSelect={setSelected}
                canOffer={false}
            />
            <PayoutRequestSummary
                quote={DEV_PAYOUT_QUOTE}
                isQuoting={false}
                isError={false}
                amount={1000}
                currency="VND"
                exchangeRate={25457.6849}
            />
        </div>
    )
}
