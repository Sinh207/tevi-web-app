'use client'

import { MY_WALLET_CONTAINER } from '@features/my-wallet'
import { PageBackBar } from '@features/navigation'
import { BarIconButton } from '@shared/components/bar-icon-button'
import { FilterMenu } from '@shared/components/filter-menu'
import { cn } from '@shared/lib/utils'
import { useState } from 'react'

/**
 * `/my-wallet/transaction-history`'s bar, with its filter — press the control and the real menu opens.
 *
 * The only place it can be seen in dev: on the real page the filter is withheld until the ledger has
 * loaded for a signed-in account, so an anonymous visitor gets the signed-out state and never reaches
 * it. Two bars rather than one, because the **active** state is the half worth looking at: the bar
 * shows the page title, not the filter, so the fill is the only signal that a filter is on.
 *
 * The options are the wallet ledger's own words, hard-coded here — `walletTransactionFilters()` is not
 * exported from the feature (see its barrel: the vocabulary is withheld so a caller cannot offer
 * `/my-star` a filter this endpoint cannot answer).
 */
const OPTIONS = [
    { key: '', label: 'All transaction' },
    { key: 'payout', label: 'Payout' },
    { key: 'platform_earning', label: 'Revenue' },
    { key: 'conversion', label: 'Exchange' },
    { key: 'commission', label: 'Commission' },
]

export function HistoryFilterPreview() {
    const [none, setNone] = useState('')
    const [active, setActive] = useState('payout')

    return (
        <div className="flex flex-col gap-2">
            <Bar value={none} onChange={setNone} />
            <Bar value={active} onChange={setActive} />
        </div>
    )
}

function Bar({ value, onChange }: { value: string; onChange: (next: string) => void }) {
    const activeLabel = value ? OPTIONS.find(option => option.key === value)?.label : undefined

    return (
        <div className="rounded-xl bg-(--background)">
            <PageBackBar
                title="Transaction history"
                className={MY_WALLET_CONTAINER}
                actions={
                    <FilterMenu
                        options={OPTIONS}
                        value={value}
                        onChange={onChange}
                        triggerLabel="Filter transactions"
                        variant="compact"
                        trigger={
                            <BarIconButton
                                name="sliders-simple"
                                label={
                                    activeLabel
                                        ? `Filter transactions — ${activeLabel}`
                                        : 'Filter transactions'
                                }
                                className={cn(
                                    activeLabel &&
                                        'bg-(--brand) text-(--text-on-accent) hover:not-disabled:bg-(--brand)',
                                )}
                            />
                        }
                    />
                }
            />
        </div>
    )
}
