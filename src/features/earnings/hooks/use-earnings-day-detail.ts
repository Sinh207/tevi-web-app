'use client'

import { useAuth } from '@features/auth'
import { useQuery } from '@tanstack/react-query'
import { earningsApi, earningsKeys } from '../api/earnings-api'
import { type EarningsCategoryRow, earningsCategoryRows } from '../lib/revenue-categories'

export interface UseEarningsDayDetailResult {
    rows: EarningsCategoryRow[]
    isLoading: boolean
    isError: boolean
    /** The request came back and the day had no category worth a line. */
    isEmpty: boolean
    refetch: () => void
}

/**
 * One day's category split, fetched the first time its row is opened.
 *
 * ## A query, where legacy has `useState` + `useEffect` + a manual `finally`
 *
 * The rewrite is not tidiness. Legacy's version keeps `details` in the row's own state, which
 * means three things that this does not:
 *
 * - **Collapsing and re-expanding refetches** — the state lives in the row and the row is
 *   remounted by the list's `AnimatePresence`. Here the answer is in the cache under
 *   `earningsKeys.detail`, so the second open is instant.
 * - **A failure is indistinguishable from an empty day.** Its `catch` sets `details` to `[]`, so
 *   a 500 renders as "this day earned nothing from anything" — on a screen about money. The three
 *   states are separate here and the view renders three different things.
 * - **Nothing is aborted.** A reader opening four rows quickly leaves four requests in flight
 *   writing into four unmounted components; `signal` lets TanStack cancel the ones nobody is
 *   waiting for.
 *
 * The account is pinned on the request and in the key, like every other call in this feature:
 * this is one account's money and the split must never be filed under another's.
 *
 * `enabled` is the row's expanded flag, so a collapsed row costs nothing. Once fetched the entry
 * stays in the cache under the client's default 60s `staleTime`, which is right for a figure that
 * is finalised — B33 asks whether a day can still change after it is reported.
 */
export function useEarningsDayDetail(dateMs: number, enabled: boolean): UseEarningsDayDetailResult {
    const { activeId } = useAuth()

    const query = useQuery({
        queryKey: earningsKeys.detail(activeId, dateMs),
        queryFn: ({ signal }) =>
            earningsApi.getDailyRevenueDetail({ dateMs, accountId: activeId, signal }),
        enabled,
        select: earningsCategoryRows,
    })

    const rows = query.data ?? []

    return {
        rows,
        isLoading: enabled && query.isPending,
        isError: query.isError,
        isEmpty: enabled && !query.isPending && !query.isError && rows.length === 0,
        refetch: () => {
            query.refetch()
        },
    }
}
