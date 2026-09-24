'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef } from 'react'
import { liveAnalyticsApi, liveAnalyticsKeys } from '../api/analytics-api'
import type { LiveTopStar } from '../lib/live-message'

/**
 * How long after the leaderboard moves before each co-host's total is re-read. Legacy's own
 * `5000` (`liveSession/hook`, the debounced effect on `topStars`): a burst of gifts moves the board
 * many times a second, and the per-seat split is not worth one request per frame.
 */
export const SEAT_SCORES_DEBOUNCE_MS = 5_000

const EMPTY = new Map<string, number>()

/**
 * **Each co-host's gift total**, for the score chip on their seat.
 *
 * ⚠ This had "no producer" in the port's own notes — the chip was wired and always zero. The
 * producer is `analytics/v2/multi-guests/{code}/gifted/`, which legacy re-reads five seconds after
 * every change to the leaderboard, and only in a room with more than one person on camera: with a
 * single host there is nobody to be ranked against and the chip is not drawn at all.
 *
 * The board is the *trigger* here and never the source. The two figures differ on purpose — the
 * board ranks senders, this splits receipts between seats — so deriving one from the other would
 * print the wrong number on every tile.
 *
 * Legacy also re-reads 2.5s after a `/give_gift` chat line. That is not carried: a gift moves the
 * board, and the board already schedules the read, so the second trigger only doubled the requests.
 */
export function useSeatScores({
    code,
    publisherCount,
    topStars,
    enabled,
}: {
    code: string | null
    publisherCount: number
    topStars: LiveTopStar[]
    enabled: boolean
}): Map<string, number> {
    const queryClient = useQueryClient()
    const active = enabled && Boolean(code) && publisherCount > 1

    const query = useQuery({
        queryKey: liveAnalyticsKeys.gifted(code ?? ''),
        queryFn: ({ signal }) => liveAnalyticsApi.getGiftedScores({ code: code as string, signal }),
        enabled: active,
        staleTime: 0,
        refetchOnWindowFocus: false,
    })

    /*
     * Debounced on the board. The first render is skipped: the query above already reads on entry,
     * and scheduling a second read five seconds later for a board nobody has touched is a request
     * with nothing new to say.
     */
    const isFirst = useRef(true)
    // biome-ignore lint/correctness/useExhaustiveDependencies: `topStars` is the debounce trigger
    useEffect(() => {
        if (isFirst.current) {
            isFirst.current = false
            return
        }
        if (!active || !code) return
        const timer = window.setTimeout(() => {
            void queryClient.invalidateQueries({ queryKey: liveAnalyticsKeys.gifted(code) })
        }, SEAT_SCORES_DEBOUNCE_MS)
        return () => window.clearTimeout(timer)
    }, [topStars, active, code, queryClient])

    return active ? (query.data ?? EMPTY) : EMPTY
}
