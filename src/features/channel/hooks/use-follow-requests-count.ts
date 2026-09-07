'use client'

import { useAuth } from '@features/auth'
import { useQuery } from '@tanstack/react-query'
import { channelApi, channelKeys } from '../api/channel-api'

/**
 * How many follow requests are waiting — the drawer's badge, and nothing else.
 *
 * ## Why it is a hook of its own and not `useFollowRequests().total`
 *
 * The screen's hook runs an infinite query for twenty rows and owns two mutations. The drawer
 * needs one integer, on every page, for a row most sessions never press. Mounting the screen's
 * hook to read `total` would fetch twenty rows into a cache entry the screen then has to share,
 * and would put the mutations' `useMutation` state in the shell. So this is a separate key with
 * a separate one-row request — see `channelKeys.followRequestsCount` for why sharing the key
 * would be worse than the extra request.
 *
 * ## `enabled`, and why the default is *off* at the call site
 *
 * `MenuDrawer` passes `{ enabled: open }`, the same gate `useIdentityStatus` takes and for the
 * same measured reason: the drawer is mounted in the shell on every page, so an ungated query
 * here is a request at bootstrap for every signed-in visitor to fill in a badge most of them
 * never see. Closing the drawer does not throw the answer away — a disabled query keeps its
 * cache — and every accept or decline invalidates this key, so the badge is correct the moment
 * it is looked at again.
 *
 * ## `isKnown` rather than a `0` default
 *
 * `0` is a claim ("nobody is waiting"), and a request that has not happened yet is not entitled
 * to make it. The drawer renders **no badge** until the answer exists, which is the same
 * distinction the Identification row draws for its value — and here it is cheap, because the
 * absence of a badge is exactly what zero looks like.
 */
export function useFollowRequestsCount({ enabled = true }: { enabled?: boolean } = {}): {
    count: number
    isKnown: boolean
} {
    const { activeId, isAuthenticated } = useAuth()

    const query = useQuery({
        queryKey: channelKeys.followRequestsCount(activeId),
        queryFn: ({ signal }) => channelApi.getFollowRequestsCount({ accountId: activeId, signal }),
        enabled: enabled && isAuthenticated,
        /*
         * Five minutes, over the client's default 60s. A queue of strangers waiting for approval
         * is not a figure anybody watches change, and the number is invalidated outright by
         * every action that moves it — so the only thing a shorter window buys is a request per
         * drawer open.
         */
        staleTime: 5 * 60_000,
    })

    return {
        count: query.data ?? 0,
        // `isSuccess`, not `!isLoading`: a failed count must not read as zero waiting.
        isKnown: query.isSuccess,
    }
}
