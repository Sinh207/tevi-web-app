'use client'

import { useAuth } from '@features/auth'
import { keepFor } from '@shared/lib/api/query-client'
import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { premiumApi, premiumKeys } from '../api/premium-api'
import type { PremiumPackage } from '../api/types'
import { type GiftPlans, groupGiftPlans } from '../lib/gift-plans'

export interface UseGiftPackagesResult {
    /** The three cards, by duration. A duration the catalogue did not offer is `null`. */
    plans: GiftPlans
    /** Every package the catalogue answered, in its own order. */
    packages: PremiumPackage[]
    isLoading: boolean
    isError: boolean
    /** The request came back and held nothing this screen can sell. Never true while loading. */
    isEmpty: boolean
    refetch: () => void
}

/**
 * What a gift costs — `premium/v1/gift-packages/?platform=web`, grouped into the three cards.
 *
 * The sibling of `usePremiumPlans`, and the three decisions it documents apply here unchanged:
 *
 * - **Enabled for a guest**, because `isAuthenticated` is true for the anonymous session the app
 *   always holds — so there is a bearer, and there is none only during the bootstrap. The *gate is
 *   the press* (`useGiftPremium.request` composes `useRequireAuth`), which is this app's rule
 *   everywhere. Gating the data instead would show a visitor an empty page and ask them to sign in
 *   to find out what a gift costs.
 * - **Everything unsettled reads as loading**, including a query that is still disabled: a disabled
 *   query reports `isLoading: false` *and* holds no data, so "not loading, no error, no packages"
 *   was true for the whole session bootstrap and the screen said "can't be loaded right now" to
 *   somebody who had just arrived.
 * - **An empty answer is not an error.** A catalogue between edits answers `[]`, and so does a
 *   payload whose every row failed `normalizePremiumPackages`. The screen then says gifting is
 *   unavailable, which is true, rather than offering a retry for a request that succeeded.
 *
 * `keepFor(30 * 60_000)` sets `staleTime` **and** `gcTime` together, which is the point of that
 * helper: a long `staleTime` with the default five-minute `gcTime` is not a long cache — the data is
 * collected five minutes after the last reader unmounts, and this screen unmounts every time
 * somebody steps back to the picker.
 */
export function useGiftPackages(): UseGiftPackagesResult {
    const { activeId, isAuthenticated } = useAuth()

    const query = useQuery({
        queryKey: premiumKeys.giftPackages(),
        queryFn: ({ signal }) => premiumApi.getGiftPackages({ accountId: activeId, signal }),
        enabled: isAuthenticated,
        ...keepFor(30 * 60_000),
    })

    const packages = query.data ?? []
    /*
     * Memoised on the query's own data reference, not on `packages`: `query.data ?? []` is a new
     * array identity on every render while the request is in flight, which would rebuild the group
     * — and re-render three cards — for an answer that has not arrived.
     */
    const plans = useMemo(() => groupGiftPlans(query.data ?? []), [query.data])

    return {
        plans,
        packages,
        isLoading: !query.isSuccess && !query.isError,
        isError: query.isError,
        isEmpty: query.isSuccess && packages.length === 0,
        refetch: () => void query.refetch(),
    }
}
