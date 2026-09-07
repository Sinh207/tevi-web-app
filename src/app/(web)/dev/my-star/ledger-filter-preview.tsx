'use client'

import { MY_STAR_CONTAINER } from '@features/my-star'
import { FilterMenu } from '@shared/components/filter-menu'
import { LedgerPanel } from '@shared/components/ledger'
import { useState } from 'react'
import { STAR_LEDGER_FIXTURE } from './fixtures'

/**
 * `/my-star`'s ledger header with its filter — press the glyph and the real menu opens.
 *
 * The only place it can be seen in dev: on the real page the panel is behind a signed-in account with
 * Star activity, so an anonymous visitor gets the signed-out prompt and never reaches it. Two panels
 * rather than one, because the **active** state is the half worth looking at — this header shows the
 * list's title, not the filter, so brand ink on the glyph is the only signal that one is on.
 *
 * `/my-wallet/transaction-history` fills a `BarIconButton` disc for the same reason; a 24px glyph in a
 * `ListHeaderAction` has no disc, which is why the treatments differ and both are worth a look.
 *
 * The options are the Star ledger's own words, hard-coded here for the reason
 * `HistoryFilterPreview`'s are: a dev preview that imported the feature's vocabulary would be a second
 * consumer of every key, and the literals make a drift visible.
 */
const OPTIONS = [
    { key: '', label: 'All transaction' },
    { key: 'consumption', label: 'Donate' },
    { key: 'conversion', label: 'Exchange' },
    { key: 'top_up', label: 'Recharge' },
    { key: 'reward', label: 'Reward' },
]

export function LedgerFilterPreview() {
    const [none, setNone] = useState('')
    const [active, setActive] = useState('conversion')

    return (
        <div className={`${MY_STAR_CONTAINER} flex flex-col gap-3`}>
            <Panel value={none} onChange={setNone} />
            <Panel value={active} onChange={setActive} />
        </div>
    )
}

function Panel({ value, onChange }: { value: string; onChange: (next: string) => void }) {
    const activeLabel = value ? OPTIONS.find(option => option.key === value)?.label : undefined

    return (
        <LedgerPanel
            title="Transaction history"
            groups={STAR_LEDGER_FIXTURE}
            action={
                <FilterMenu
                    options={OPTIONS}
                    value={value}
                    onChange={onChange}
                    active={Boolean(activeLabel)}
                    triggerLabel={
                        activeLabel ? `Filter transactions — ${activeLabel}` : 'Filter transactions'
                    }
                    variant="compact"
                    icon="sliders-simple"
                />
            }
        />
    )
}
