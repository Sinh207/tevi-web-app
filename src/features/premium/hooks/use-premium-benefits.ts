'use client'

import { useAuth } from '@features/auth'
import { keepFor } from '@shared/lib/api/query-client'
import { useQuery } from '@tanstack/react-query'
import { premiumApi, premiumKeys } from '../api/premium-api'
import type { PremiumBenefit } from '../api/types'

export interface UsePremiumBenefitsResult {
    benefits: PremiumBenefit[]
    isLoading: boolean
    isError: boolean
    refetch: () => void
}

/**
 * What Premium unlocks — `premium/v1/benefits/`.
 *
 * Editorial, platform-wide content: the same list for everybody, with no account in the key. It is
 * enabled for a guest for the reason `usePremiumPlans` gives at length — this half of the page is
 * the *argument* for subscribing, and withholding it from somebody who has not signed in leaves the
 * page with nothing but prices on it.
 *
 * **An error is silent here, and that is deliberate.** The benefits are one section of four; a
 * failed request costs that section and nothing else, so the screen drops it rather than raising a
 * toast or a retry button over a page that is still perfectly usable. Legacy raises a toast for
 * exactly this, on a page whose prices and copy are unaffected. `isError` is exposed anyway because
 * the *view* is the right place to decide that, not this hook.
 */
export function usePremiumBenefits(): UsePremiumBenefitsResult {
    const { activeId, isAuthenticated } = useAuth()

    const query = useQuery({
        queryKey: premiumKeys.benefits(),
        queryFn: ({ signal }) => premiumApi.getBenefits({ accountId: activeId, signal }),
        enabled: isAuthenticated,
        ...keepFor(30 * 60_000),
    })

    return {
        benefits: query.data ?? [],
        /*
         * Derived from `isSuccess`, so a query that is still **disabled** reads as loading — the
         * gate is `isAuthenticated`, which is false for the length of the session bootstrap, and a
         * disabled query reports `isLoading: false` with no data. Without this the section vanished
         * for that whole window and then appeared, which reads as a layout bug rather than as a
         * page still arriving. `usePremiumPlans` documents the same call at length.
         */
        isLoading: !query.isSuccess && !query.isError,
        isError: query.isError,
        refetch: () => void query.refetch(),
    }
}
