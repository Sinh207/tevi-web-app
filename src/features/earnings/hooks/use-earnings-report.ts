'use client'

import { useAuth } from '@features/auth'
import { useMyChannel } from '@features/channel'
import { keepFor } from '@shared/lib/api/query-client'
import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { earningsApi, earningsKeys } from '../api/earnings-api'
import type { EarningsDay } from '../api/types'

/**
 * Who is allowed to see the figures on this screen, and whether they have loaded.
 *
 * ## The access answer is a **tri-state**, for the reason `useChannelOwnership` is
 *
 * `'unknown'` is not a rounding error to default away. The session bootstrap and the
 * `my-channel` request both have to land before "is this your report?" has an answer, and every
 * wrong guess in that window is visible:
 *
 * - default to `'denied'` and a creator opening their own report is told it is not theirs, for a
 *   beat, on every load;
 * - default to `'allowed'` and the query fires for a session that may turn out to be anonymous.
 *
 * So the skeleton covers it, which is the honest answer to "we do not know yet".
 */
export type EarningsAccess = 'unknown' | 'allowed' | 'signed-out' | 'not-owner'

export interface UseEarningsReportResult {
    days: EarningsDay[]
    access: EarningsAccess
    isLoading: boolean
    isError: boolean
    /** `true` only once the request came back **and** held nothing. */
    isEmpty: boolean
    refetch: () => void
    /** The reader's own slug, for the "go to your own report" link on the `not-owner` state. */
    mySlug: string | null
}

/**
 * The earnings report's data and its gate.
 *
 * ## The gate is not decoration, and it is not a permission check either
 *
 * The endpoint takes no channel: it answers for whoever the bearer is (see `api/earnings-api.ts`).
 * So `/@bob/earnings-report` opened by Alice returns **Alice's** money, and legacy renders it —
 * her figures, under his address, with his name in the back button. Nothing leaks; it is the
 * reader's own data. What it does is make a URL lie, and a URL that lies about whose money this
 * is, is one screenshot away from a support ticket.
 *
 * The fix is a comparison, not an authorisation: if the slug in the path is not the reader's own
 * channel, the screen says so and offers the right link. Case-insensitive, because a channel's
 * canonical spelling is the creator's own and `/@Noraazima` and `/@noraazima` are the same person
 * (`canonicalChannelRedirect` says the same thing one level up).
 *
 * ## The query is gated on `access`, not on `isAuthenticated`
 *
 * `enabled: access === 'allowed'` means the wrong-slug case makes **no request at all**. Fetching
 * and then declining to render would be a wasted round trip, and worse, it would fill the cache
 * under the reader's own key with data a later, legitimate visit would then serve from cache — so
 * the two states would disagree about whether anything had loaded.
 */
export function useEarningsReport(slug: string): UseEarningsReportResult {
    const { activeId, isAuthenticated, isBootstrapping } = useAuth()
    const { myChannel, isLoading: isChannelLoading } = useMyChannel()

    const mySlug = myChannel?.slug ?? null

    const access: EarningsAccess = useMemo(() => {
        // Before `!isAuthenticated`, never after it — the ordering is the whole point of the
        // tri-state. See `useChannelOwnership`, where getting it backwards flashed the wrong UI.
        if (isBootstrapping) return 'unknown'
        if (!isAuthenticated) return 'signed-out'
        // A real account whose channel has not resolved yet cannot be compared against. It is not
        // "not the owner" — it is not known, and `myChannel` is `undefined` rather than `null`
        // for exactly this window.
        if (myChannel === undefined || isChannelLoading) return 'unknown'
        if (!mySlug) return 'not-owner'
        return mySlug.toLowerCase() === slug.toLowerCase() ? 'allowed' : 'not-owner'
    }, [isBootstrapping, isAuthenticated, isChannelLoading, myChannel, mySlug, slug])

    const query = useQuery({
        queryKey: earningsKeys.daily(activeId),
        queryFn: ({ signal }) => earningsApi.getDailyRevenue({ accountId: activeId, signal }),
        /*
         * Fifteen minutes, and this one is a judgement rather than a consequence.
         *
         * `earningsKeys` is the one money key **not** nested under `balanceKeys.all`, so no socket
         * refreshes it and this `staleTime` is the only freshness mechanism the screen has. The data
         * is daily buckets, of which only today's is still moving — a creator opening the report
         * twice in a quarter of an hour is asking the same question, not a newer one. Shorten it if
         * the report is ever expected to read as live.
         */
        ...keepFor(15 * 60_000),
        enabled: access === 'allowed',
    })

    const days = query.data ?? []

    return {
        days,
        access,
        /*
         * `isLoading` is false while the query is disabled, which is correct for TanStack and
         * wrong for this screen — a disabled query on an `'unknown'` access is precisely the
         * moment the reader should see a skeleton. Folding it in here keeps the view from having
         * to know that.
         */
        isLoading: access === 'unknown' || (access === 'allowed' && query.isLoading),
        isError: query.isError,
        isEmpty: access === 'allowed' && !query.isLoading && !query.isError && days.length === 0,
        refetch: () => {
            query.refetch()
        },
        mySlug,
    }
}
