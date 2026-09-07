'use client'

import { MY_WALLET_TRANSACTION_HISTORY_PATH, TeviCoinAppLink } from '@features/my-wallet'
import { LedgerPanel } from '@shared/components/ledger'
import { LedgerDetailDialog } from '@shared/components/ledger-detail-dialog'
import { Button } from '@shared/ui/button'
import Link from 'next/link'
import { useState } from 'react'
import { WALLET_LEDGER_FIXTURE } from './fixtures'

/**
 * The ledger, live — press a row and the real detail sheet opens over this page.
 *
 * The only place it can be opened in dev, for the reason `CurrencyDialogPreview` gives about the
 * currency list: the real screen needs a signed-in creator who has actually transacted, so an
 * anonymous visitor sees the signed-out state and never reaches a row. The **View all** link is here
 * too, so the panel's header is the one the screen ships.
 *
 * The sheet's strings are the fixture's rather than `useWalletEntryDetail`'s — that hook needs a
 * `LedgerEntry` DTO, which is what this page does not have. Layout, the copy control and the chip are
 * the same components either way, and those are what a design pass is here to look at.
 */
const DETAIL = {
    title: 'Transaction details',
    statusText: 'Transaction completed successfully on',
    closeLabel: 'Close',
    time: '19 Feb 2025, 14:32',
    description:
        'Revenue from membership renewals, direct donations and three interactive live sessions',
    amount: '+₫21,391,626',
    /*
     * The Tevi Coin bonus block (**B83**) — the figure, legacy's sentence and the way into the mini
     * app. Here so the note panel, its `--background-subtle` surface and the link's RTL arrow can be
     * looked at; the real screens pass the same shape from `useWalletEntryDetail`.
     */
    bonus: {
        label: 'Bonus:',
        amount: '+10',
        mark: { src: '/tevi-coin.svg', size: 16 },
        note: 'In addition to the revenue you earn, Tevi will reward you a random bonus in Tevi Coin. Check it out in the',
        link: <TeviCoinAppLink />,
    },
    rows: [
        {
            field: 'id',
            label: 'Transaction ID',
            value: 'b7f3c1a2-9d84-4e6f-bd51-0c2a7e93f118',
            copyValue: 'b7f3c1a2-9d84-4e6f-bd51-0c2a7e93f118',
        },
        { field: 'type', label: 'Transaction type', value: 'Revenue', chip: true },
        { field: 'time', label: 'Time', value: '19 Feb 2025, 14:32' },
    ],
}

export function LedgerDetailPreview() {
    const [open, setOpen] = useState(false)

    return (
        <>
            <LedgerPanel
                title="Transaction history"
                groups={WALLET_LEDGER_FIXTURE}
                /* The real screens pass their query's page size; 20 is both ledgers'. */
                pageSize={20}
                fullBleed
                onRowPress={() => setOpen(true)}
                action={
                    <Button
                        variant="ghost"
                        size="small"
                        className="h-auto px-0 text-base font-normal text-(--text-brand) transition-colors hover:not-disabled:bg-transparent hover:underline"
                        render={<Link href={MY_WALLET_TRANSACTION_HISTORY_PATH} />}
                    >
                        View all
                    </Button>
                }
            />
            <LedgerDetailDialog {...DETAIL} open={open} onClose={() => setOpen(false)} />
        </>
    )
}
