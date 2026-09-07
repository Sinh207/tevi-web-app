// @vitest-environment jsdom
import type { LedgerEntry } from '@features/balance'
import { DEFAULT_CURRENCY } from '@shared/lib/money'
import { act, render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useWalletEntryDetail } from './use-wallet-entry-detail'

/**
 * The one thing this hook does that a comment cannot pin: it holds a **selection**, not a snapshot.
 *
 * The sheet is open across refetches — a spend invalidates `balanceKeys.all`, and the ledger under it
 * is replaced. Holding the entry would freeze the figure the reader opened; holding the id means the
 * sheet either shows current data or closes itself because the row is gone. Both halves of that are
 * below, and neither is visible from a call site.
 */

const FEB = Date.UTC(2025, 1, 19, 12, 0)

function entry(over: Partial<LedgerEntry> = {}): LedgerEntry {
    return {
        id: 'tx-1',
        txId: 'tx-1',
        type: 'platform_earning',
        description: 'Revenue from @yeett',
        createdAt: FEB,
        currency: 'USD',
        amount: 0.8,
        ...over,
    }
}

function renderHook(initial: LedgerEntry[]) {
    let api: ReturnType<typeof useWalletEntryDetail> | undefined
    function Probe({ entries }: { entries: LedgerEntry[] }) {
        api = useWalletEntryDetail({ entries, displayCurrency: DEFAULT_CURRENCY, rate: 1 })
        return null
    }
    const view = render(<Probe entries={initial} />)
    return {
        read: () => api as ReturnType<typeof useWalletEntryDetail>,
        /** Replace the page cache under the open sheet, as a refetch would. */
        setEntries: (entries: LedgerEntry[]) => view.rerender(<Probe entries={entries} />),
    }
}

describe('selection', () => {
    it('shows nothing until a row is chosen', () => {
        const { read } = renderHook([entry()])
        expect(read().detail).toBeNull()
        expect(read().entry).toBeUndefined()
    })

    it('resolves the chosen id against the current entries', () => {
        const { read } = renderHook([entry(), entry({ id: 'tx-2', amount: -3 })])
        act(() => read().select('tx-2'))

        expect(read().entry?.id).toBe('tx-2')
        // The row's own unit and sign, formatted — the sheet takes finished strings.
        expect(read().detail?.amount).toContain('3')
        expect(read().detail?.rows.map(row => row.value)).toContain('tx-2')
    })

    it('follows a refetch instead of freezing the figure it opened with', () => {
        const { read, setEntries } = renderHook([entry({ amount: 0.8 })])
        act(() => read().select('tx-1'))
        const before = read().detail?.amount

        // Same id, corrected amount — what a refetch after a settlement looks like.
        setEntries([entry({ amount: 1.25 })])
        expect(read().detail?.amount).not.toBe(before)
        expect(read().detail?.amount).toContain('1.25')
    })

    it('closes itself when the open row leaves the cache', () => {
        const { read, setEntries } = renderHook([entry()])
        act(() => read().select('tx-1'))
        expect(read().detail).not.toBeNull()

        // A filter change, or a page dropped — the row is simply not there any more.
        setEntries([entry({ id: 'tx-9' })])
        expect(read().detail).toBeNull()
        expect(read().entry).toBeUndefined()
    })

    it('closes on request', () => {
        const { read } = renderHook([entry()])
        act(() => read().select('tx-1'))
        act(() => read().close())
        expect(read().detail).toBeNull()
    })
})

describe('the rows', () => {
    it('offers a copy control on the id and nothing else', () => {
        const { read } = renderHook([entry()])
        act(() => read().select('tx-1'))

        const rows = read().detail?.rows ?? []
        expect(rows.filter(row => row.copyValue).map(row => row.copyValue)).toEqual(['tx-1'])
        // The type is the chip, per legacy's own treatment.
        expect(rows.filter(row => row.chip)).toHaveLength(1)
    })

    it('falls back to the raw slug for a type this ledger does not know', () => {
        const { read } = renderHook([entry({ type: 'space_tier_bonus', description: '' })])
        act(() => read().select('tx-1'))
        // A reader who can see `space_tier_bonus` can ask about it; a blank cell is unaskable.
        expect(read().detail?.rows.find(row => row.chip)?.value).toBe('space_tier_bonus')
    })

    it('drops an empty description rather than printing a blank line', () => {
        const { read } = renderHook([entry({ description: '' })])
        act(() => read().select('tx-1'))
        expect(read().detail?.description).toBeUndefined()
    })
})
