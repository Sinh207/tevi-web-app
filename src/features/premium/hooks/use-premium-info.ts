'use client'

import { useAuth } from '@features/auth'
import { useMyChannel } from '@features/channel'
import { useQuery } from '@tanstack/react-query'
import { premiumApi, premiumKeys } from '../api/premium-api'
import type { PremiumInfo } from '../api/types'

export interface UsePremiumInfoResult {
    info: PremiumInfo | null
    isLoading: boolean
    /**
     * A refetch is in flight over data that is **already cached** — which right after a redemption
     * is the *previous* grant.
     *
     * `isLoading` is false in that window, so a receipt gated on it alone prints the grant the
     * reader had before the code they just spent. `features/gift-code`'s result panel is the caller
     * that needs it; this screen does not, because its date is not the answer to something the
     * reader just did.
     */
    isFetching: boolean
    isError: boolean
}

/**
 * This account's Premium grant — `premium/v1/user/info/`, for the **date** and nothing else.
 *
 * ## Why it is not what decides whether the reader has Premium
 *
 * `useMyChannel().isPremium` already answers that, everywhere in the app, off a payload that is
 * fetched once per account and refreshed by the `premium_info` socket frame. Two sources for one
 * boolean is how legacy's avatar ring and verified badge come to disagree with the rest of the
 * channel body — it patches `myChannel.is_premium` from a socket payload in one place and reads this
 * endpoint in another. So this hook answers a question only this endpoint can: **when does it run
 * out**.
 *
 * ## Which is also why `isPremium` gates the request
 *
 * An account without Premium has no expiry, so asking is a round trip for a `null`. The gate is not
 * a guess either — it flips on its own the moment the purchase lands, because `isPremium` is
 * derived from a query the socket frame invalidates, so the date appears without this hook knowing
 * a payment happened.
 *
 * A guest is gated by the same two conditions the rest of the app uses: the app always holds a
 * session, including an anonymous one, so `isAuthenticated` alone is true for somebody who has never
 * signed in — and an anonymous account's Premium standing is a guaranteed `false`.
 *
 * Freshness after a purchase is `usePremiumSync`'s job, and after a **redeemed code** it is
 * `useRedeemCode`'s; both evict the stored validator before invalidating — see
 * `forgetPremiumInfoCache` for the 304 that makes the difference.
 *
 * ## Two callers, one endpoint
 *
 * This screen prints the expiry on the hero's receipt line. `features/gift-code`'s result panel
 * prints the grant a code just produced — the same body, asked the same way, which is why the
 * parser and the hook live here rather than being duplicated there (they were, until this feature
 * existed).
 */
export function usePremiumInfo(): UsePremiumInfoResult {
    const { activeId, isAuthenticated, isAnonymous } = useAuth()
    const { isPremium } = useMyChannel()

    const query = useQuery({
        queryKey: premiumKeys.info(activeId),
        queryFn: ({ signal }) => premiumApi.getInfo({ accountId: activeId, signal }),
        enabled: isAuthenticated && !isAnonymous && isPremium,
    })

    return {
        info: query.data ?? null,
        /*
         * `isLoading`, not `isPending`: a disabled query is pending forever, and the receipt line
         * would hold a skeleton for every reader who does not have Premium at all.
         */
        isLoading: query.isLoading,
        isFetching: query.isFetching,
        isError: query.isError,
    }
}
