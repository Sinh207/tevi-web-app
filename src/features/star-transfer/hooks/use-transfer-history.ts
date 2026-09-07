'use client'

import { useAuth } from '@features/auth'
import { useTranslation } from '@shared/i18n/use-translation'
import { useInfiniteQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { TRANSFER_HISTORY_PAGE_SIZE, transferApi, transferKeys } from '../api/transfer-api'
import type { Transfer } from '../api/types'
import { formatTransferDay, transferDayKey } from '../lib/transfer-time'

/** A day's worth of transfers. */
export interface TransferGroup {
    /** Locale-independent identity, so a language switch does not re-bucket the list. */
    key: string
    label: string
    rows: Transfer[]
}

export interface UseTransferHistoryResult {
    groups: TransferGroup[]
    isLoading: boolean
    isError: boolean
    isEmpty: boolean
    hasNextPage: boolean
    isFetchingNextPage: boolean
    fetchNextPage: () => void
    refetch: () => void
}

/**
 * The transfers this account has sent, paginated and grouped by month.
 *
 * ## Grouped by **day**, as `web-app` groups it
 *
 * It grouped by month first, to match `/my-star` and `/my-wallet`. That was the wrong reference: there is
 * no comp for this screen, so legacy is the specification, and legacy buckets this list per day. It also
 * suits what the list is for — *"what did I send on Tuesday"* rather than a monthly statement.
 *
 * The helpers are `lib/transfer-time.ts`'s. See that file for why the *label* is `Intl`'s and not
 * legacy's hard-coded `dd/MM/yyyy`.
 *
 * ## Page numbers, not a cursor
 *
 * Billy takes `?page&page_size` and answers with `results`, so "is there more" has to be *inferred* —
 * `results.length === page_size`, which is legacy's rule too and the same one `useStarLedger` uses.
 * One known cost: a history whose total is an exact multiple of 20 spins for one extra request that
 * comes back empty. That beats stopping early on a full last page and silently hiding rows. B38 asks
 * for a `count` or a `next`.
 *
 * ## No filter
 *
 * There is nothing to filter *by*: the endpoint answers with one kind of row (transfers out), unlike
 * the Star ledger's eleven transaction types. A filter control with one option in it is furniture.
 */
export function useTransferHistory(): UseTransferHistoryResult {
    const { activeId, isAuthenticated } = useAuth()
    const { currentLanguage } = useTranslation()

    /**
     * Memoised because `transferKeys.history` builds a **new array** every call, and an unstable key
     * identity is what makes the callbacks below churn.
     */
    const queryKey = useMemo(() => transferKeys.history(activeId), [activeId])

    const query = useInfiniteQuery({
        queryKey,
        initialPageParam: 1,
        queryFn: ({ pageParam, signal }) =>
            transferApi.getHistory({ page: pageParam, accountId: activeId, signal }),
        /*
         * A short page is the end. `lastPageParam + 1` rather than `pages.length + 1`: they are the
         * same number today and stop being the same the moment a page is dropped or the list is
         * seeded, at which point counting pages asks for the wrong one.
         */
        getNextPageParam: (lastPage, _pages, lastPageParam) =>
            lastPage.length === TRANSFER_HISTORY_PAGE_SIZE ? lastPageParam + 1 : undefined,
        enabled: isAuthenticated && Boolean(activeId),
    })

    const entries = useMemo(() => query.data?.pages.flat() ?? [], [query.data])

    const groups = useMemo(() => {
        const out: TransferGroup[] = []
        for (const entry of entries) {
            const key = transferDayKey(entry.createdAt)
            /*
             * Appended to the last group rather than looked up in a map, which is what keeps the
             * server's order: rows arrive newest-first, so same-month rows are adjacent. A map would
             * silently merge a Tuesday row that arrived after a Wednesday one back into an earlier
             * Tuesday group — reordering a history, which is the one thing not to do to one.
             */
            const last = out.at(-1)
            if (last && last.key === key) last.rows.push(entry)
            else
                out.push({
                    key,
                    label: formatTransferDay(entry.createdAt, currentLanguage),
                    rows: [entry],
                })
        }
        return out
    }, [entries, currentLanguage])

    const isLoading = query.isLoading

    return {
        groups,
        isLoading,
        isError: query.isError,
        isEmpty: !isLoading && !query.isError && entries.length === 0,
        hasNextPage: query.hasNextPage,
        isFetchingNextPage: query.isFetchingNextPage,
        fetchNextPage: () => {
            // Guarded so the sentinel can call it freely: an intersection observer fires more than
            // once for one crossing, and TanStack would otherwise queue a duplicate.
            if (query.hasNextPage && !query.isFetchingNextPage) query.fetchNextPage()
        },
        refetch: () => {
            query.refetch()
        },
    }
}
