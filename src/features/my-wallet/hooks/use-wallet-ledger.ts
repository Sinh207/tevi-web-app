'use client'

import { useAuth } from '@features/auth'
import { formatLedgerAmount, isStarEntry } from '@features/balance'
import type { LedgerGroupModel } from '@shared/components/ledger'
import { useTranslation } from '@shared/i18n/use-translation'
import { formatLedgerDateTime, formatLedgerMonth, ledgerMonthKey } from '@shared/lib/ledger-time'
import type { Currency } from '@shared/lib/money'
import { useInfiniteQuery } from '@tanstack/react-query'
import { useCallback, useMemo, useState } from 'react'
import {
    WALLET_LEDGER_PAGE_SIZE,
    walletLedgerApi,
    walletLedgerKeys,
} from '../api/wallet-ledger-api'
import {
    ALL_WALLET_TRANSACTIONS,
    isWalletTransactionFilter,
    walletTransactionIcon,
    walletTransactionLabelKey,
} from '../lib/wallet-transaction-types'

export interface UseWalletLedgerResult {
    groups: LedgerGroupModel[]
    /** The active filter slug. `''` is "All transaction". */
    filter: string
    setFilter: (type: string) => void
    isLoading: boolean
    isError: boolean
    /** Came back empty with **no** filter applied. */
    isEmpty: boolean
    /** Came back empty **because of** the filter. A different message. */
    isFilteredEmpty: boolean
    hasNextPage: boolean
    isFetchingNextPage: boolean
    fetchNextPage: () => void
    refetch: () => void
}

/**
 * The currency ledger, paginated, filtered, grouped by month and mapped to display rows.
 *
 * The sibling of `features/my-star`'s `useStarLedger`, and the differences are the whole reason the two
 * screens are separate features: a different endpoint, a different filter vocabulary, and — the one that
 * shows — **a unit that the reader chooses**. This hook takes the currency and rate as arguments rather
 * than reading `useCurrency` itself, so the screen decides once and the ledger cannot disagree with the
 * card above it.
 *
 * ## Where the mapping happens, and why here
 *
 * `shared/components/ledger` is props-only and knows nothing about billy, currencies or transaction types —
 * which is what lets the two screens share one copy of the layout without depending on each other. The
 * cost is a mapping step, and it belongs in the hook: this is the only place with the DTO, the vocabulary,
 * the unit *and* the locale at once.
 *
 * Legacy is the counter-example. Its two ledger components are ~300 near-identical lines each and have
 * already drifted — the currency one reuses the Star one's resize-observer id.
 *
 * ## Page numbers, not a cursor
 *
 * Billy takes `?page&page_size` and answers with `results`, so "is there more" is *inferred* —
 * `results.length === page_size`, which is legacy's rule. One known cost: a ledger whose total is an exact
 * multiple of 20 shows a spinner for one extra request that comes back empty. That beats stopping early on
 * a full last page and silently hiding rows. B38 asks for a `count` or a `next`.
 */
export function useWalletLedger({
    displayCurrency,
    rate,
}: {
    displayCurrency: Currency
    rate: number
}): UseWalletLedgerResult {
    const { activeId, isAuthenticated } = useAuth()
    /*
     * `t` is used **here**, not in the view: `shared/components/ledger` takes finished strings, so a row's
     * title has to be resolved before it gets there. That is the trade for the shared layout, and it is the
     * right side of it — the alternative is each screen re-implementing the panel.
     */
    const { t, currentLanguage } = useTranslation()
    const [filter, setFilterState] = useState<string>(ALL_WALLET_TRANSACTIONS)

    /** Memoised because `walletLedgerKeys.list` builds a new array every call. */
    const queryKey = useMemo(() => walletLedgerKeys.list(activeId, filter), [activeId, filter])

    const query = useInfiniteQuery({
        queryKey,
        initialPageParam: 1,
        queryFn: ({ pageParam, signal }) =>
            walletLedgerApi.getLedger({
                page: pageParam,
                type: filter,
                accountId: activeId,
                signal,
            }),
        /*
         * `lastPageParam + 1` rather than `pages.length + 1`: the same number today, and they stop being
         * the same the moment a page is dropped or the list is seeded, at which point counting pages asks
         * for the wrong one.
         */
        getNextPageParam: (lastPage, _pages, lastPageParam) =>
            lastPage.length === WALLET_LEDGER_PAGE_SIZE ? lastPageParam + 1 : undefined,
        enabled: isAuthenticated && Boolean(activeId),
    })

    const entries = useMemo(() => query.data?.pages.flat() ?? [], [query.data])

    const groups = useMemo(() => {
        const out: LedgerGroupModel[] = []
        for (const entry of entries) {
            const key = ledgerMonthKey(entry.createdAt)
            const labelKey = walletTransactionLabelKey(entry.type)
            const row = {
                id: entry.id,
                /*
                 * The backend's sentence, then our label, then the raw slug. Each step is one degree worse
                 * and none of them is blank: a reader who can see `space_tier_bonus` can ask about it, and
                 * a reader looking at an empty line cannot.
                 */
                title: entry.description || (labelKey ? t(labelKey) : entry.type),
                subtitle: formatLedgerDateTime(entry.createdAt, currentLanguage),
                /*
                 * The unit is the **row's**, not the screen's. A currency ledger can contain a Star row — a
                 * `conversion` has a leg in each — and showing that with a dollar sign would misreport it
                 * by a factor of a hundred. `formatLedgerAmount` branches on `entry.currency` first.
                 */
                amount: formatLedgerAmount({
                    amount: entry.amount,
                    currency: entry.currency,
                    displayCurrency,
                    rate,
                    locale: currentLanguage,
                }),
                isCredit: entry.amount >= 0,
                icon: walletTransactionIcon(entry.type),
                amountMark: isStarEntry(entry.currency)
                    ? { src: '/tevi-star.png', size: 20 }
                    : undefined,
            }
            /*
             * Appended to the last group rather than looked up in a map, which is what keeps the server's
             * order: rows arrive newest-first, so same-month rows are adjacent. A map would silently merge
             * a March row that arrived after an April one back into an earlier March group — reordering a
             * ledger, which is the one thing not to do to it.
             */
            const last = out.at(-1)
            if (last && last.key === key) last.rows.push(row)
            else
                out.push({
                    key,
                    label: formatLedgerMonth(entry.createdAt, currentLanguage),
                    rows: [row],
                })
        }
        return out
    }, [entries, currentLanguage, displayCurrency, rate, t])

    const setFilter = useCallback((type: string) => {
        // Sanitised against this ledger's own vocabulary — see `isWalletTransactionFilter`.
        if (!isWalletTransactionFilter(type)) return
        setFilterState(type)
    }, [])

    const isLoading = query.isLoading
    const settledEmpty = !isLoading && !query.isError && entries.length === 0

    return {
        groups,
        filter,
        setFilter,
        isLoading,
        isError: query.isError,
        /*
         * Split here rather than in the view, because only this hook knows whether a filter is applied.
         * They say different things — "you have never had a transaction" versus "nothing matches this
         * filter" — and offering the first when the second is true sends a creator looking for a bug in
         * their earnings.
         */
        isEmpty: settledEmpty && filter === ALL_WALLET_TRANSACTIONS,
        isFilteredEmpty: settledEmpty && filter !== ALL_WALLET_TRANSACTIONS,
        hasNextPage: query.hasNextPage,
        isFetchingNextPage: query.isFetchingNextPage,
        fetchNextPage: () => {
            // Guarded so the sentinel can call it freely: an observer fires more than once per crossing.
            if (query.hasNextPage && !query.isFetchingNextPage) query.fetchNextPage()
        },
        refetch: () => {
            query.refetch()
        },
    }
}
