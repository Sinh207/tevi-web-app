'use client'

import { useAuth } from '@features/auth'
import { useQuery } from '@tanstack/react-query'
import { payoutApi, payoutKeys } from '../api/payout-api'

/**
 * One payout request, for `/my-wallet/payout-tracking/{id}`.
 *
 * ## Three outcomes, not two
 *
 * `isError` (the request failed), `isMissing` (it succeeded and there is no such payout), and the
 * request itself. Legacy has two: both its `else` branch and its `catch` set the detail to `null`, so
 * a dead network and a deleted payout show the same empty state — and the reader is told there is
 * nothing to see when in fact nothing was asked.
 *
 * ## No `setTimeout` around the loading flag
 *
 * Legacy ends its `finally` with `setTimeout(() => setIsLoading(false), 1000)`, so every load of this
 * screen holds its skeleton for a second after the data has arrived. Nothing depends on it; it is a
 * second of nothing, on a screen a creator opens to find out where their money is.
 *
 * The key is under `payoutKeys`, itself under `balanceKeys.all` — a payout moves the balance, so
 * whatever invalidates the figure invalidates this too.
 */
export function usePayoutRequest(id: string) {
    const { activeId, isAuthenticated } = useAuth()

    const query = useQuery({
        queryKey: payoutKeys.request(activeId, id),
        queryFn: ({ signal }) => payoutApi.getRequest({ id, accountId: activeId, signal }),
        // Five minutes, matching the list this is the detail of. The key sits under
        // `balanceKeys.all` (see above), so the socket refreshes it the moment the money moves.
        staleTime: 5 * 60_000,
        enabled: isAuthenticated && Boolean(activeId) && Boolean(id),
    })

    return {
        request: query.data ?? null,
        isLoading: query.isLoading,
        isError: query.isError,
        /** The request answered, and there is no such payout. Distinct from a failure. */
        isMissing: query.isSuccess && query.data === null,
        refetch: () => {
            query.refetch()
        },
    }
}
