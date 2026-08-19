'use client'

import { AffiliateDialog, affiliateKeys, type Program } from '@features/affiliate'
import { useAuth } from '@features/auth'
import { Button } from '@shared/ui/button'
import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

/**
 * The affiliate dialog, driven by fixtures.
 *
 * The real dialog needs a signed-in account with an active affiliate campaign, so it cannot be
 * reached on a dev machine — which is exactly the state in which its three screens, the switch
 * confirmation and the leave confirmation are easiest to get wrong.
 *
 * **The dialog itself is real** — the frame, the step machine, the sticky CTA, both confirmations.
 * Only its reads are stubbed, by seeding the query cache under the keys the hook reads. A disabled
 * query still returns cached data, and `useAffiliateData` gates on auth, so an anonymous visitor
 * gets the fixtures and no request. The writes will fail against a live service, which is the honest
 * boundary of a preview: everything up to the button is inspectable, the button is not.
 */
const PROGRAMS: Program[] = [
    {
        id: 'p1',
        name: 'Coin Rush',
        url: 'https://example.com/coin-rush',
        icon_url: null,
        commission_rate: 12.5,
        estimate_income: 1500,
        promoter_count: 1500,
    },
    {
        id: 'p2',
        name: 'A mini app with a name long enough to need truncating in the row',
        url: 'https://example.com/long',
        icon_url: null,
        commission_rate: 8,
        // No estimate — the row falls back to the commission rate.
        estimate_income: null,
        promoter_count: 0,
    },
    {
        id: 'p3',
        name: 'Zero Estimate',
        url: null,
        icon_url: null,
        commission_rate: 30,
        // Zero is a real figure and must render as $0.00, not as a dash.
        estimate_income: 0,
        promoter_count: 42,
    },
]

export function AffiliatePreview() {
    const queryClient = useQueryClient()
    const { activeId } = useAuth()
    const [open, setOpen] = useState(false)

    const seed = (promoting: boolean) => {
        queryClient.setQueryData(affiliateKeys.programs(activeId), PROGRAMS)
        queryClient.setQueryData(
            affiliateKeys.current(activeId),
            promoting
                ? {
                      program: PROGRAMS[0],
                      referral_url: 'https://tevi.dev/r/abc123XYZ-long-enough-to-truncate',
                  }
                : null,
        )
        queryClient.setQueryData(
            affiliateKeys.stats(activeId),
            promoting ? { referee_count: 12345, total_earnings: 4400.03 } : null,
        )
        setOpen(true)
    }

    return (
        <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-8">
            <header className="flex flex-col gap-1">
                <h1 className="type-title-t1-semibold text-(--text-title)">Affiliate programs</h1>
                <p className="type-body-default text-(--text-body)">
                    The real dialog on stubbed reads. Writes hit the live service and will fail
                    here.
                </p>
            </header>

            <div className="flex flex-wrap gap-3">
                <Button variant="accent" onClick={() => seed(false)}>
                    Open — promoting nothing
                </Button>
                <Button variant="secondary" onClick={() => seed(true)}>
                    Open — already promoting
                </Button>
            </div>

            <ul className="type-dense-default flex list-disc flex-col gap-1 ps-5 text-(--text-subtitle)">
                <li>“Promoting nothing” → the list, every row offering Join.</li>
                <li>
                    “Already promoting” → the Promoting card, rows offering Switch, and the ⋯ menu.
                </li>
                <li>
                    Press a row to reach the detail; press the Promoting card to reach the joined
                    screen.
                </li>
                <li>Escape or the backdrop returns to the list before it closes the dialog.</li>
            </ul>

            {open ? <AffiliateDialog open={open} onOpenChange={setOpen} /> : null}
        </main>
    )
}
