'use client'

import { useAuth } from '@features/auth'
import { useQuery } from '@tanstack/react-query'
import { useCallback, useState } from 'react'
import { channelApi, channelKeys } from '../api/channel-api'
import type { FollowedLive } from '../api/types'
import { FOLLOWED_LIVES_COLLAPSED } from '../lib/following-page'

/**
 * The Live now strip above `/following` — which of the spaces you follow are on air.
 *
 * ## A plain `useQuery`, and it stays that way
 *
 * The endpoint takes `limit` and returns no cursor, so there is no second page to ask for: ten rows
 * is the whole answer (`FOLLOWED_LIVES_LIMIT`). Reaching for `useInfiniteQuery` here would model a
 * pagination the wire does not have and leave `hasNextPage` permanently true.
 *
 * ## Collapsed to five, expandable to ten — presentation, not transport
 *
 * All ten arrive in the one request; `visible` is a slice. Legacy does the same, and it matters that
 * the distinction is visible from here: "Show more" costs nothing and cannot fail, which is why it is
 * a button with no pending state and no error path.
 *
 * ## A failure hides the strip; it does not report one
 *
 * `isError` is published and the view drops the block on it. That is the honest outcome for an
 * optional strip above the list the screen is actually about: an error card saying "could not load
 * live streams" over a working list of follows spends the reader's attention on the wrong thing, and
 * an empty strip would claim nobody is live — which this does not know. The `staleTime` inherited
 * from `query-client.ts` means it re-asks on the next visit rather than sitting broken.
 */
export interface UseFollowedLivesResult {
    /** The rows to draw — five, or all of them once expanded. */
    visible: FollowedLive[]
    /** How many the payload carried, before the slice. */
    total: number
    isLoading: boolean
    isError: boolean
    /** More were returned than are shown. */
    canExpand: boolean
    /** Everything is shown and there is something to collapse back to. */
    canCollapse: boolean
    expand: () => void
    collapse: () => void
}

export function useFollowedLives({
    limit,
    collapsible = true,
    enabled = true,
}: {
    /** Off until the caller has somewhere to show them — the studio asks only once it has ended. */
    enabled?: boolean
    /** How many to ask for. Defaults to `/following`'s ten — see `getFollowedLives`. */
    limit?: number
    /**
     * Whether the list starts cut to five with a *Show more*.
     *
     * `/following` wants that: the strip sits above the list the screen is actually about, so it
     * has to yield space to it. The **home page's Lives tab** does not — there the list *is* the
     * screen, and collapsing it would hide rows behind a control for no reason. Legacy has two
     * separate implementations for that one difference.
     *
     * With it off, `visible` is everything and `canExpand` / `canCollapse` are permanently false,
     * so a caller that ignores them draws the right thing.
     */
    collapsible?: boolean
} = {}): UseFollowedLivesResult {
    const { activeId, isAuthenticated } = useAuth()
    const [expanded, setExpanded] = useState(false)

    const query = useQuery({
        /*
         * `limit` is part of the key. Two surfaces asking for ten and fifty are two different
         * answers, and sharing a key would serve whichever landed first to both — `/following`
         * would get fifty rows to slice to five, or home's tab would silently cap at ten.
         */
        queryKey: [...channelKeys.followedLives(activeId), limit ?? null],
        queryFn: ({ signal }) =>
            channelApi.getFollowedLives({ limit, accountId: activeId, signal }),
        enabled: enabled && isAuthenticated,
    })

    const lives = query.data ?? []
    const hasMore = lives.length > FOLLOWED_LIVES_COLLAPSED

    const expand = useCallback(() => setExpanded(true), [])
    const collapse = useCallback(() => setExpanded(false), [])

    const showsAll = !collapsible || expanded

    return {
        visible: showsAll ? lives : lives.slice(0, FOLLOWED_LIVES_COLLAPSED),
        total: lives.length,
        isLoading: query.isLoading,
        isError: query.isError,
        canExpand: collapsible && hasMore && !expanded,
        canCollapse: collapsible && hasMore && expanded,
        expand,
        collapse,
    }
}
