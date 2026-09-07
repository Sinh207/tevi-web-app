// @vitest-environment jsdom
import type { LedgerEntry } from '@features/balance'
import { DEFAULT_CURRENCY } from '@shared/lib/money'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { WALLET_LEDGER_PAGE_SIZE } from '../api/wallet-ledger-api'
import { useWalletLedger } from './use-wallet-ledger'

/**
 * What this hook promises that no call site can see, and no comment can pin:
 *
 * - a request carries the account that was active when it went out, never whichever bearer is active
 *   when it lands;
 * - "is there another page" is *inferred* from a full page, because billy sends no `count` (B38);
 * - month groups keep the server's order, so a March row arriving after an April one does not get
 *   merged back into an earlier March bucket;
 * - "empty" and "empty **because of** the filter" are different answers, and the view needs both;
 * - a filter this ledger cannot answer is refused rather than sent.
 *
 * The first is a race. The third is the one a comment cannot state, because it is a property of the
 * loop rather than of any line in it.
 */

const getLedger = vi.hoisted(() => vi.fn())

vi.mock('../api/wallet-ledger-api', async () => {
    const actual = await vi.importActual<typeof import('../api/wallet-ledger-api')>(
        '../api/wallet-ledger-api',
    )
    return { ...actual, walletLedgerApi: { ...actual.walletLedgerApi, getLedger } }
})

const auth = vi.hoisted(() => ({
    state: { activeId: 'acc-1' as string | null, isAuthenticated: true, isBootstrapping: false },
}))
vi.mock('@features/auth', () => ({ useAuth: () => auth.state }))

/**
 * Two different months, and both **mid-month on purpose**: `ledgerMonthKey` buckets in the reader's
 * own zone, so a fixture at `Jan 31 19:45Z` is February for anyone east of UTC+5 and the test would
 * pass or fail by where it was run. Legacy's own `dd MMM yyyy` has the same property; the fix is to
 * keep fixtures away from the boundary rather than to pin a zone the app never pins.
 */
const FEB = Date.UTC(2025, 1, 19, 12, 0)
const JAN = Date.UTC(2025, 0, 15, 12, 0)

function entry(over: Partial<LedgerEntry> = {}): LedgerEntry {
    return {
        id: 'tx-1',
        txId: 'tx-1',
        type: 'platform_earning',
        description: 'Revenue',
        createdAt: FEB,
        currency: 'USD',
        amount: 12.5,
        ...over,
    }
}

/** A full page, so `getNextPageParam` infers there is another one. */
function fullPage(prefix: string, createdAt = FEB): LedgerEntry[] {
    return Array.from({ length: WALLET_LEDGER_PAGE_SIZE }, (_, index) =>
        entry({ id: `${prefix}-${index}`, createdAt }),
    )
}

function renderHook() {
    const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })
    let api: ReturnType<typeof useWalletLedger> | undefined
    function Probe() {
        api = useWalletLedger({ displayCurrency: DEFAULT_CURRENCY, rate: 1 })
        return null
    }
    render(
        <QueryClientProvider client={queryClient}>
            <Probe />
        </QueryClientProvider>,
    )
    return { queryClient, read: () => api as ReturnType<typeof useWalletLedger> }
}

beforeEach(() => {
    vi.clearAllMocks()
    auth.state = { activeId: 'acc-1', isAuthenticated: true, isBootstrapping: false }
    getLedger.mockResolvedValue([entry()])
})

describe('the request', () => {
    it('pins the account that was active when it went out', async () => {
        const { read } = renderHook()
        await waitFor(() => expect(read().groups.length).toBe(1))
        expect(getLedger.mock.calls[0][0]).toMatchObject({ accountId: 'acc-1', page: 1 })
    })

    it('is not made at all without a real account', async () => {
        auth.state = { activeId: null, isAuthenticated: false, isBootstrapping: false }
        const { read } = renderHook()
        // Every visitor carries an anonymous session; this endpoint answers for a bearer that owns a
        // balance, so a guest must not ask it.
        await waitFor(() => expect(read().isLoading).toBe(false))
        expect(getLedger).not.toHaveBeenCalled()
    })

    it('omits the type when no filter is applied', async () => {
        renderHook()
        await waitFor(() => expect(getLedger).toHaveBeenCalled())
        // `''` — `createApiModel` strips empty params, so "All transaction" is the *absence* of the
        // parameter rather than a magic value the backend has to know.
        expect(getLedger.mock.calls[0][0].type).toBe('')
    })
})

describe('pagination', () => {
    it('infers another page from a full one, and stops on a short one', async () => {
        getLedger.mockResolvedValueOnce(fullPage('a'))
        const { read } = renderHook()
        await waitFor(() => expect(read().hasNextPage).toBe(true))

        getLedger.mockResolvedValueOnce([entry({ id: 'b-0' })])
        await act(async () => {
            read().fetchNextPage()
        })
        await waitFor(() => expect(read().hasNextPage).toBe(false))
        expect(getLedger.mock.calls[1][0].page).toBe(2)
    })

    it('asks for `lastPageParam + 1`, not `pages.length + 1`', async () => {
        getLedger.mockResolvedValue(fullPage('a'))
        const { read } = renderHook()
        await waitFor(() => expect(read().hasNextPage).toBe(true))
        await act(async () => {
            read().fetchNextPage()
        })
        await waitFor(() => expect(getLedger).toHaveBeenCalledTimes(2))
        /*
         * The same number today. They stop being the same the moment a page is dropped from the
         * cache or the list is seeded, at which point counting pages asks for the wrong one — which
         * is why the hook reads the param it was given.
         */
        expect(getLedger.mock.calls[1][0].page).toBe(2)
    })

    it('ignores a fetchNextPage while one is already in flight', async () => {
        getLedger.mockResolvedValue(fullPage('a'))
        const { read } = renderHook()
        await waitFor(() => expect(read().hasNextPage).toBe(true))
        /*
         * Three calls in **one tick**, which is what an intersection observer does when it reports
         * several entries for a single crossing. `isFetchingNextPage` is last render's value, so it
         * is still `false` for all three — this is what the synchronous latch in the hook is for, and
         * without it this produced three requests for page 2.
         */
        await act(async () => {
            read().fetchNextPage()
            read().fetchNextPage()
            read().fetchNextPage()
        })
        await waitFor(() => expect(getLedger).toHaveBeenCalledTimes(2))
    })
})

describe('month grouping', () => {
    it('keeps the server order rather than bucketing by month', async () => {
        /*
         * February, January, then February **again** — which a `Map` keyed by month would silently
         * merge back into the first February group, reordering a ledger. Appending to the last group
         * instead means the out-of-order row stays where the server put it.
         */
        getLedger.mockResolvedValue([
            entry({ id: '1', createdAt: FEB }),
            entry({ id: '2', createdAt: JAN }),
            entry({ id: '3', createdAt: FEB }),
        ])
        const { read } = renderHook()
        await waitFor(() => expect(read().groups.length).toBe(3))

        const groups = read().groups
        expect(groups.map(group => group.rows.map(row => row.id))).toEqual([['1'], ['2'], ['3']])
        expect(groups[0].key).toBe(groups[2].key)
    })

    it('titles a row with the backend sentence, then the type label, then the slug', async () => {
        getLedger.mockResolvedValue([
            entry({ id: '1', description: 'Revenue from @yeett' }),
            entry({ id: '2', description: '', type: 'payout' }),
            entry({ id: '3', description: '', type: 'space_tier_bonus' }),
        ])
        const { read } = renderHook()
        await waitFor(() => expect(read().groups.length).toBe(1))

        const titles = read().groups[0].rows.map(row => row.title)
        expect(titles[0]).toBe('Revenue from @yeett')
        // A translated label for a type this ledger knows…
        expect(titles[1]).not.toBe('')
        expect(titles[1]).not.toBe('payout')
        // …and the raw slug for one it does not, because a reader who can see it can ask about it.
        expect(titles[2]).toBe('space_tier_bonus')
    })

    it('marks a Star row as Star even in the currency ledger', async () => {
        // A `conversion` has a leg in each unit. Formatting a Star amount as dollars would misreport
        // it by a factor of a hundred.
        getLedger.mockResolvedValue([entry({ type: 'conversion', currency: 'TVS', amount: -500 })])
        const { read } = renderHook()
        await waitFor(() => expect(read().groups.length).toBe(1))
        expect(read().groups[0].rows[0].amountMark).toBeDefined()
    })
})

describe('the two empty states', () => {
    it('tells "no transactions" apart from "none match this filter"', async () => {
        getLedger.mockResolvedValue([])
        const { read } = renderHook()
        await waitFor(() => expect(read().isEmpty).toBe(true))
        expect(read().isFilteredEmpty).toBe(false)

        await act(async () => {
            read().setFilter('payout')
        })
        await waitFor(() => expect(read().isFilteredEmpty).toBe(true))
        // Offering "you have never transacted" to somebody who has merely filtered sends a creator
        // looking for a bug in their earnings.
        expect(read().isEmpty).toBe(false)
    })

    it('claims neither while the first page is still loading', async () => {
        let resolve: (value: LedgerEntry[]) => void = () => {}
        getLedger.mockReturnValue(new Promise<LedgerEntry[]>(next => (resolve = next)))
        const { read } = renderHook()
        expect(read().isLoading).toBe(true)
        expect(read().isEmpty).toBe(false)
        expect(read().isFilteredEmpty).toBe(false)
        await act(async () => {
            resolve([])
        })
        await waitFor(() => expect(read().isEmpty).toBe(true))
    })
})

describe('the filter', () => {
    it('refuses a slug this ledger cannot answer', async () => {
        const { read } = renderHook()
        await waitFor(() => expect(getLedger).toHaveBeenCalled())

        await act(async () => {
            // A Star-only type. Sending it would ask billy a question with no answer, and an empty
            // list reads as "no activity" rather than as a bad filter.
            read().setFilter('top_up')
        })
        expect(read().filter).toBe('')

        await act(async () => {
            read().setFilter('payout')
        })
        expect(read().filter).toBe('payout')
    })

    it('sends the filter and keys the list on it', async () => {
        const { read } = renderHook()
        await waitFor(() => expect(getLedger).toHaveBeenCalled())
        await act(async () => {
            read().setFilter('payout')
        })
        await waitFor(() => expect(getLedger).toHaveBeenCalledTimes(2))
        expect(getLedger.mock.calls[1][0]).toMatchObject({ type: 'payout', page: 1 })
    })
})
