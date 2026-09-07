'use client'

import { useAuth } from '@features/auth'
import { useQuery } from '@tanstack/react-query'
import { donationApi, donationKeys } from '../api/donation-api'

/**
 * A space's donation offer, or `null` when it takes none.
 *
 * ## Two components read this and it is one request
 *
 * The action row's button and the About tab's support card both need the offer, and on a channel
 * page both are mounted. They call this hook independently and TanStack deduplicates them onto one
 * query — which is the whole reason neither of them takes the offer as a prop and why there is no
 * provider here. Legacy holds it in the channel viewer context precisely because it had no such
 * mechanism, and pays for it with a context that every unrelated part of the page re-renders on.
 *
 * ## `null` is a resolved answer, not a failure
 *
 * `donationApi.getOffer` swallows the 404, so a space with no offer resolves **successfully** with
 * `null`. That is what lets a call site write `if (!offer) return null` and get an absent button
 * rather than a retry prompt — on roughly half of all spaces, which is not an edge case.
 *
 * A real failure (a 500, an outage) still errors, and both call sites render nothing for it: an
 * error message where a Donate button would go tells the reader about our infrastructure, not about
 * the creator. The offer is optional content, so its absence is a legitimate view of the page.
 */
export function useDirectDonate(slug: string, { enabled = true }: { enabled?: boolean } = {}) {
    const { activeId } = useAuth()

    const query = useQuery({
        queryKey: donationKeys.offer(activeId, slug),
        queryFn: () => donationApi.getOffer(slug, activeId),
        enabled: enabled && Boolean(slug),
    })

    return {
        offer: query.data ?? null,
        /** `isLoading`, not `isPending`: a disabled query is pending forever and is not loading. */
        isLoading: query.isLoading,
        isError: query.isError,
    }
}
