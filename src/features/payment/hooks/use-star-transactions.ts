'use client'

import { useAuth } from '@features/auth'
import { useInfiniteQuery } from '@tanstack/react-query'
import { useCallback, useMemo } from 'react'
import { checkoutApi, TRANSACTIONS_PAGE_SIZE } from '../api/checkout-api'
import { paymentKeys } from '../api/keys'
import type { StarTransaction } from '../api/types'

export interface UseStarTransactionsResult {
    rows: StarTransaction[]
    isLoading: boolean
    isError: boolean
    /** Answered, and this account has never bought Star. Never true while loading. */
    isEmpty: boolean
    hasNextPage: boolean
    isFetchingNextPage: boolean
    fetchNextPage: () => void
    refetch: () => void
}

/**
 * The reader's own Star purchases, paginated.
 *
 * ## Why this is not the ledger on `/my-star`
 *
 * That list is billy's **balance movements** — Star arriving and leaving, whatever the reason. This
 * is paymee's **payments**: what was charged, through which gateway, and whether it went through. A
 * top-up that failed or is still pending produces no ledger entry at all, which makes it precisely
 * the row somebody opens this list to find — having been charged and not credited. Two endpoints,
 * two questions; linking the masthead at `/my-star` answered the wrong one.
 *
 * ## `enabled` defaults to true, and the account check is not optional
 *
 * The screen **is** the list, so there is no state in which it should not be asked for — `enabled`
 * stays a parameter only so a future surface that shows this list conditionally does not have to
 * reach for a second hook.
 *
 * The account check is not an optimisation: every visitor carries an anonymous session, so without it
 * every guest who reaches the page would fire an authenticated list request that can only come back
 * empty — and the view would then have to tell them "no purchases yet", which is a claim about
 * somebody the request was never made for. The view draws a sign-in state instead.
 *
 * ## Paging stops on the count, not on a short page
 *
 * This endpoint reports `count`, where billy's ledger does not — so the end is known rather than
 * inferred from `results.length === page_size`, the compromise `use-star-ledger.ts` documents and
 * B38 asks to remove. When `count` is missing the short-page rule is the fallback, so a backend that
 * drops the field degrades to the behaviour the other list already has.
 */
export function useStarTransactions({ enabled = true }: { enabled?: boolean } = {}) {
    const { activeId, isAuthenticated } = useAuth()

    const query = useInfiniteQuery({
        queryKey: paymentKeys.transactions(activeId),
        initialPageParam: 1,
        queryFn: ({ pageParam, signal }) =>
            checkoutApi.list({ page: pageParam, accountId: activeId, signal }),
        /*
         * `lastPageParam + 1` rather than `pages.length + 1`: the same number today, and they stop
         * being the same the moment a page is dropped or the list is seeded — at which point counting
         * pages asks for the wrong one. The rule `use-star-ledger.ts` settled on.
         */
        getNextPageParam: (lastPage, pages, lastPageParam) => {
            if (lastPage.count !== null) {
                const loaded = pages.reduce((total, page) => total + page.rows.length, 0)
                return loaded < lastPage.count ? lastPageParam + 1 : undefined
            }
            return lastPage.rows.length === TRANSACTIONS_PAGE_SIZE ? lastPageParam + 1 : undefined
        },
        enabled: enabled && isAuthenticated,
        /*
         * A purchase list changes only when this reader buys something, and `PaymentProvider`
         * invalidates `paymentKeys.all` on every settle — so the figure is refreshed by the event
         * that changes it rather than by a clock.
         */
        staleTime: 5 * 60 * 1000,
    })

    const rows = useMemo(
        () => query.data?.pages.flatMap(page => page.rows) ?? [],
        [query.data?.pages],
    )

    return {
        rows,
        /*
         * `isLoading` is false for a *disabled* query, which would make a guest's screen read as an
         * empty history rather than as one that never asked. The view draws a sign-in state for that
         * case instead, so both flags stay honest about what actually happened.
         */
        isLoading: query.isLoading && enabled && isAuthenticated,
        isError: query.isError,
        isEmpty: !query.isLoading && !query.isError && rows.length === 0,
        hasNextPage: query.hasNextPage,
        isFetchingNextPage: query.isFetchingNextPage,
        fetchNextPage: useCallback(() => {
            void query.fetchNextPage()
        }, [query.fetchNextPage]),
        refetch: useCallback(() => {
            void query.refetch()
        }, [query.refetch]),
    } satisfies UseStarTransactionsResult
}
