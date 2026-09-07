'use client'

import { useAuth } from '@features/auth'
import { useTranslation } from '@shared/i18n/use-translation'
import { formatLedgerMonth, ledgerMonthKey } from '@shared/lib/ledger-time'
import { useInfiniteQuery } from '@tanstack/react-query'
import { useMemo, useRef } from 'react'
import { payoutApi, payoutKeys } from '../api/payout-api'
import type { PayoutRequest } from '../api/types'

/** A month's worth of payout requests, in the order the server sent them. */
export interface PayoutRequestGroup {
    /** Locale-independent identity, so a language switch does not re-bucket the list. */
    key: string
    label: string
    rows: PayoutRequest[]
}

export interface UsePayoutRequestsResult {
    groups: PayoutRequestGroup[]
    isLoading: boolean
    isError: boolean
    /** Settled with nothing to show. There is no filter here, so there is only one empty state. */
    isEmpty: boolean
    hasNextPage: boolean
    isFetchingNextPage: boolean
    fetchNextPage: () => void
    refetch: () => void
}

/**
 * Every payout request this account has made, paginated and grouped by month.
 *
 * The sibling of `useWalletLedger`, and deliberately the same shape — the two screens read different
 * endpoints but a reader scrolling a list of dated money does not care which. What is **not** shared
 * is a filter: billy's `payout-request/` takes none, so this hook has one empty state where the
 * ledgers have two, and no `setFilter` to offer a control that could not answer.
 *
 * ## Grouped by month, keeping the server's order
 *
 * Legacy buckets into an object keyed by `MMMM, yyyy`, which silently merges an out-of-order row back
 * into an earlier group — reordering a list of money, the one thing not to do to it. This appends to
 * the last group instead, so rows stay where the server put them. Same rule, same reason, as the
 * ledger; the helpers are the ledger's too (`shared/lib/ledger-time`), which is what keeps the two
 * lists reading identically.
 *
 * ## Page numbers, and this endpoint says when to stop
 *
 * `?page&page_size`, and `next` from the payload itself — `billing/payout-request/` sends
 * `count`/`next`/`previous`, unlike the two ledger endpoints. So this list does not pay B38's cost of
 * one extra empty request when a total lands on a page boundary.
 */
export function usePayoutRequests(): UsePayoutRequestsResult {
    const { activeId, isAuthenticated } = useAuth()
    const { currentLanguage } = useTranslation()

    const queryKey = useMemo(() => payoutKeys.requests(activeId), [activeId])

    const query = useInfiniteQuery({
        queryKey,
        initialPageParam: 1,
        queryFn: ({ pageParam, signal }) =>
            payoutApi.getRequests({ page: pageParam, accountId: activeId, signal }),
        /*
         * The endpoint's **own** `next`, not a full page. `billing/payout-request/` sends
         * `count`/`next`, so there is nothing to infer here — see the model's note, and B38 for why
         * the two ledgers still have to guess.
         *
         * `lastPageParam + 1`, never `pages.length + 1`: the same number today, and they stop being
         * the same the moment a page is dropped from the cache or the list is seeded.
         */
        getNextPageParam: (lastPage, _pages, lastPageParam) =>
            lastPage.hasMore ? lastPageParam + 1 : undefined,
        /*
         * Five minutes. A row appears here when the reader submits a withdrawal — which invalidates
         * this key directly — and its status then advances over hours on billy's side, with
         * `balance_change` arriving when the money actually moves. Nothing about that is a 60-second
         * question, and re-asking is an infinite list's worth of pages each time.
         */
        staleTime: 5 * 60_000,
        enabled: isAuthenticated && Boolean(activeId),
    })

    const rows = useMemo(() => query.data?.pages.flatMap(page => page.rows) ?? [], [query.data])

    const groups = useMemo(() => {
        const out: PayoutRequestGroup[] = []
        for (const row of rows) {
            const key = ledgerMonthKey(row.createdAt)
            const last = out.at(-1)
            if (last && last.key === key) last.rows.push(row)
            else
                out.push({
                    key,
                    label: formatLedgerMonth(row.createdAt, currentLanguage),
                    rows: [row],
                })
        }
        return out
    }, [rows, currentLanguage])

    /*
     * A synchronous latch beside the query's own flag, because that flag is **last render's**. Two
     * calls in the same tick both read `isFetchingNextPage === false` and both fetch, which is what an
     * intersection observer does when it reports several entries for one crossing. Measured on the
     * ledger hook before it had this: three calls in one tick produced three requests for page 2.
     */
    const isAdvancing = useRef(false)

    const isLoading = query.isLoading

    return {
        groups,
        isLoading,
        isError: query.isError,
        isEmpty: !isLoading && !query.isError && rows.length === 0,
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
