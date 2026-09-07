'use client'

import { useAuth } from '@features/auth'
import { formatLedgerAmount, isStarEntry, type LedgerEntry } from '@features/balance'
import type { LedgerGroupModel } from '@shared/components/ledger'
import { TEVI_STAR_SRC } from '@shared/components/star-mark'
import { useTranslation } from '@shared/i18n/use-translation'
import { formatLedgerDateTime, formatLedgerMonth, ledgerMonthKey } from '@shared/lib/ledger-time'
import { DEFAULT_CURRENCY } from '@shared/lib/money'
import { useInfiniteQuery } from '@tanstack/react-query'
import { useCallback, useMemo, useRef, useState } from 'react'
import { STAR_LEDGER_PAGE_SIZE, starLedgerApi, starLedgerKeys } from '../api/star-ledger-api'
import {
    ALL_STAR_TRANSACTIONS,
    isStarTransactionFilter,
    starTransactionIcon,
    starTransactionLabelKey,
} from '../lib/star-transaction-types'

export interface UseStarLedgerResult {
    groups: LedgerGroupModel[]
    /**
     * The rows behind `groups`, unformatted — what the detail sheet needs.
     *
     * `groups` holds finished strings, because `shared/components/ledger` takes finished strings; the
     * sheet needs the DTO (the id, the raw amount, the type slug). Rather than parse the display row
     * back, the hook hands out both views of the same page cache.
     */
    entries: LedgerEntry[]
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
 * The Star ledger, paginated, filtered, grouped by month and mapped to display rows.
 *
 * ## Where the mapping happens, and why here
 *
 * `shared/components/ledger` is props-only and knows nothing about billy, Star or transaction types —
 * which is what lets `/my-star` and `/my-wallet` share one copy of the layout without depending on each
 * other. The cost of that is a mapping step, and it belongs in the hook: this is the only place that
 * has the DTO, the vocabulary *and* the locale at once.
 *
 * Legacy is the counter-example. Its two ledger components are ~300 near-identical lines each and have
 * already drifted — the currency one reuses the Star one's resize-observer id.
 *
 * ## Page numbers, not a cursor
 *
 * `/settings/blocked-accounts` is this repo's other infinite list and pages by an opaque cursor off
 * `next`. Billy does not: it takes `?page&page_size` and answers with `results`, so "is there more" has
 * to be *inferred* — `results.length === page_size`, which is legacy's rule too. One known cost: a
 * ledger whose total is an exact multiple of 20 shows a spinner for one extra request that comes back
 * empty. That beats the alternative, which is stopping early on a full last page and silently hiding
 * rows. B38 asks for a `count` or a `next`.
 *
 * ## Star rows carry no rate
 *
 * `DEFAULT_CURRENCY` and `rate: 1` are passed to `formatLedgerAmount` as inert arguments, not as
 * placeholders for something missing: a `TVS` row is a count and the function branches on the row's own
 * currency first. They are only reached by the rare non-Star row that can appear here — a `conversion`
 * has a leg in each — and showing that in the reader's chosen currency would mean this screen
 * subscribing to the exchange service for a value it almost never uses.
 */
export function useStarLedger(): UseStarLedgerResult {
    const { activeId, isAuthenticated } = useAuth()
    /*
     * `t` is used **here**, not in the view: `shared/components/ledger` takes finished strings, so a
     * row's title has to be resolved before it gets there. That is the trade for the shared layout, and
     * it is the right side of it — the alternative is each screen re-implementing the panel.
     */
    const { t, currentLanguage } = useTranslation()
    const [filter, setFilterState] = useState<string>(ALL_STAR_TRANSACTIONS)

    /**
     * Memoised because `starLedgerKeys.list` builds a **new array** every call, and an unstable key
     * identity is what makes the callbacks below churn. Derived from two primitives, so it changes
     * exactly when one of them does.
     */
    const queryKey = useMemo(() => starLedgerKeys.list(activeId, filter), [activeId, filter])

    const query = useInfiniteQuery({
        queryKey,
        initialPageParam: 1,
        queryFn: ({ pageParam, signal }) =>
            starLedgerApi.getLedger({
                page: pageParam,
                type: filter,
                accountId: activeId,
                signal,
            }),
        /*
         * A short page is the end. `lastPageParam + 1` rather than `pages.length + 1`: they are the same
         * number today, and they stop being the same the moment a page is dropped or the list is
         * seeded, at which point counting pages asks for the wrong one.
         */
        getNextPageParam: (lastPage, _pages, lastPageParam) =>
            lastPage.length === STAR_LEDGER_PAGE_SIZE ? lastPageParam + 1 : undefined,
        /*
         * Five minutes, not the 60s default, and the socket is why. Every movement of Star or money
         * emits `balance_change`, which invalidates `balanceKeys.all` — and this list's key is
         * *under* that, so it refetches the moment the figure it explains moves. A `staleTime` here
         * buys no freshness the socket does not already provide; all it does is re-request on a
         * remount, and this is an infinite list, so that costs **every page the reader scrolled**.
         */
        staleTime: 5 * 60_000,
        enabled: isAuthenticated && Boolean(activeId),
    })

    /*
     * A synchronous latch beside the query's own flag, because that flag is **last render's**.
     * `isFetchingNextPage` only becomes true after a re-render, so two calls in the *same* tick both
     * read `false` and both fetch — which is exactly what an intersection observer does when it
     * reports several entries for one crossing. Measured before this latch: three calls in one act
     * produced three requests for page 2.
     *
     * A ref rather than state: it must be true for the next caller *now*, and it must not cause a
     * render of its own.
     */
    const isAdvancing = useRef(false)

    const entries = useMemo(() => query.data?.pages.flat() ?? [], [query.data])

    const groups = useMemo(() => {
        const out: LedgerGroupModel[] = []
        for (const entry of entries) {
            const key = ledgerMonthKey(entry.createdAt)
            const labelKey = starTransactionLabelKey(entry.type)
            const row = {
                id: entry.id,
                /*
                 * The backend's sentence, then our label, then the raw slug. Each step is one degree
                 * worse and none of them is blank: a reader who can see `space_tier_bonus` can ask
                 * about it, and a reader looking at an empty line cannot.
                 */
                title: entry.description || (labelKey ? t(labelKey) : entry.type),
                subtitle: formatLedgerDateTime(entry.createdAt, currentLanguage),
                amount: formatLedgerAmount({
                    amount: entry.amount,
                    currency: entry.currency,
                    displayCurrency: DEFAULT_CURRENCY,
                    rate: 1,
                    locale: currentLanguage,
                }),
                isCredit: entry.amount >= 0,
                icon: starTransactionIcon(entry.type, isStarEntry(entry.currency)),
                // The gold mark, on Star rows only — a fiat row must not be labelled with it.
                amountMark: isStarEntry(entry.currency)
                    ? { src: TEVI_STAR_SRC, size: 20 }
                    : undefined,
            }
            /*
             * Appended to the last group rather than looked up in a map, which is what keeps the
             * server's order: rows arrive newest-first, so same-month rows are adjacent. A map would
             * silently merge a March row that arrived after an April one back into an earlier March
             * group — reordering a ledger, which is the one thing not to do to it.
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
    }, [entries, currentLanguage, t])

    const setFilter = useCallback((type: string) => {
        // Sanitised against this ledger's own vocabulary — see `isStarTransactionFilter`.
        if (!isStarTransactionFilter(type)) return
        setFilterState(type)
    }, [])

    const isLoading = query.isLoading
    const settledEmpty = !isLoading && !query.isError && entries.length === 0

    return {
        groups,
        entries,
        filter,
        setFilter,
        isLoading,
        isError: query.isError,
        /*
         * The two empty states are split here rather than in the view, because only this hook knows
         * whether a filter is applied. They say different things — "you have never had a transaction"
         * versus "nothing matches this filter" — and offering the first when the second is true sends a
         * creator looking for a bug in their balance.
         */
        isEmpty: settledEmpty && filter === ALL_STAR_TRANSACTIONS,
        isFilteredEmpty: settledEmpty && filter !== ALL_STAR_TRANSACTIONS,
        hasNextPage: query.hasNextPage,
        isFetchingNextPage: query.isFetchingNextPage,
        fetchNextPage: () => {
            if (!query.hasNextPage || query.isFetchingNextPage || isAdvancing.current) return
            isAdvancing.current = true
            query.fetchNextPage().finally(() => {
                isAdvancing.current = false
            })
        },
        refetch: () => {
            query.refetch()
        },
    }
}
