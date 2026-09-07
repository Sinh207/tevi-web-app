'use client'

import { useAuth } from '@features/auth'
import { keepFor } from '@shared/lib/api/query-client'
import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { premiumApi, premiumKeys } from '../api/premium-api'
import type { PremiumPackage } from '../api/types'
import { groupPlans, type PremiumPlans, savingsPercent } from '../lib/plans'

export interface UsePremiumPlansResult {
    /** The three cards, by cadence. A cadence the catalogue did not offer is `null`. */
    plans: PremiumPlans
    /** Every package the catalogue answered, in its own order. */
    packages: PremiumPackage[]
    /** The annual discount as a whole percentage, or `null` when there is none to claim. */
    savings: number | null
    isLoading: boolean
    isError: boolean
    /** The request came back and held nothing this screen can sell. Never true while loading. */
    isEmpty: boolean
    refetch: () => void
}

/**
 * What Premium costs — `premium/v1/packages/?platform=web`, grouped into the three cards.
 *
 * ## Enabled for a guest, on purpose
 *
 * This is a **price list**, and `/premium` is a page somebody arrives at from an ad, a share or the
 * end-rail card before they have signed in. Gating the request on a real account would show them an
 * empty page and ask them to sign in to find out the price, which is the opposite of what the page
 * is for. `isAuthenticated` is still required — it is true for the anonymous session the app always
 * holds, so there is a bearer for the request and none for a visitor whose bootstrap has not landed
 * yet.
 *
 * Legacy's `initData` returns early unless `isAuthenticated`, and its anonymous session makes that
 * true in practice; what it does *not* do is gate the **press**, which is where the gate belongs
 * (`docs/DEFINITION_OF_DONE.md` §3, and `useSubscribePremium` is where it is applied).
 *
 * ## Platform data, cached hard
 *
 * The key carries no account and `staleTime` is 30 minutes: the catalogue is a table the backoffice
 * edits, not per-reader state, and re-fetching it while somebody is choosing a plan could move a
 * price under them mid-decision. Same call, and the same number, as `useStarPackages`.
 *
 * ## An empty answer is not an error
 *
 * A catalogue between edits answers `[]`, and so does a payload whose every row failed the parser's
 * "can this be bought" bar (`normalizePremiumPackages`). The screen then says Premium cannot be
 * bought right now, which is true, rather than showing a retry button for a request that succeeded —
 * and it still shows the benefits and the copy, because those are what the page is *about*.
 */
export function usePremiumPlans(): UsePremiumPlansResult {
    const { activeId, isAuthenticated } = useAuth()

    const query = useQuery({
        queryKey: premiumKeys.packages(),
        queryFn: ({ signal }) => premiumApi.getPackages({ accountId: activeId, signal }),
        enabled: isAuthenticated,
        ...keepFor(30 * 60_000),
    })

    const packages = query.data ?? []
    /*
     * Memoised on the query's own data reference, not on `packages`: `query.data ?? []` is a new
     * array identity on every render while the request is in flight, which would rebuild the group
     * (and re-render three cards) for an answer that has not arrived.
     */
    const plans = useMemo(() => groupPlans(query.data ?? []), [query.data])
    const savings = useMemo(() => savingsPercent(plans), [plans])

    return {
        plans,
        packages,
        savings,
        /*
         * **Everything that has not settled is "loading", including a query that is still disabled.**
         *
         * That is the whole reason these three are derived from `isSuccess` rather than from
         * `isLoading`. The query is gated on `isAuthenticated`, which is `false` for the length of
         * the session bootstrap — a `/me` round trip, and on a cold device a Firebase anonymous
         * sign-in before it. A disabled query reports `isLoading: false` **and** holds no data, so
         * "not loading, no error, no packages" was true for that whole window and the screen said
         * *"Premium plans can't be loaded right now"* to somebody who had simply just arrived.
         *
         * A skeleton is the honest answer there: a bearer is coming, and the prices with it.
         */
        isLoading: !query.isSuccess && !query.isError,
        isError: query.isError,
        /** Settled, and it held nothing this screen can sell. Never true before the answer. */
        isEmpty: query.isSuccess && packages.length === 0,
        refetch: () => void query.refetch(),
    }
}
