'use client'

import { useAuth } from '@features/auth'
import {
    addRecentCreator,
    getRecentCreators,
    type RecentCreator,
    removeRecentCreator,
    subscribeRecentCreators,
} from '@shared/lib/search-recent-creators'
import { useCallback, useSyncExternalStore } from 'react'
import { type SearchChannel, searchChannelName } from '../api/types'

/**
 * The **Recent creators** row, bound to the account that is active now.
 *
 * Same shape as `useSearchRecents`, for the same reason: the list is written by every row on the
 * screen (opening one records it) and read by the strip, so it subscribes to one external store
 * rather than mirroring it into state. `isReady` is the same trick too — the list is device state,
 * so it is empty on the server and the hydrating render, and the idle body must not mistake "not
 * read yet" for "nothing opened".
 */

const EMPTY: RecentCreator[] = []
const TRUE = () => true
const FALSE = () => false

export interface UseRecentCreatorsResult {
    /** Newest first, at most five. */
    creators: RecentCreator[]
    isReady: boolean
    /** Record a space the reader opened from a result row. */
    remember: (channel: SearchChannel) => void
    /** A tile was opened again — move it back to the front, keeping what it already holds. */
    reopen: (creator: RecentCreator) => void
    forget: (slug: string) => void
}

export function useRecentCreators(): UseRecentCreatorsResult {
    const { activeId } = useAuth()

    const isReady = useSyncExternalStore(subscribeRecentCreators, TRUE, FALSE)
    const creators = useSyncExternalStore(
        subscribeRecentCreators,
        () => getRecentCreators(activeId ?? ''),
        () => EMPTY,
    )

    const remember = useCallback(
        (channel: SearchChannel) => {
            if (!activeId) return
            addRecentCreator(
                {
                    slug: channel.slug,
                    name: searchChannelName(channel) || null,
                    thumb: channel.images.thumb,
                    verifiedImage: channel.verified_tick_badge?.image ?? null,
                    isPremium: channel.is_premium,
                    isNsfw: channel.is_nsfw,
                },
                activeId,
            )
        },
        [activeId],
    )

    const reopen = useCallback(
        ({ at: _at, ...creator }: RecentCreator) => {
            if (activeId) addRecentCreator(creator, activeId)
        },
        [activeId],
    )

    const forget = useCallback(
        (slug: string) => {
            if (activeId) removeRecentCreator(slug, activeId)
        },
        [activeId],
    )

    return { creators, isReady, remember, reopen, forget }
}
