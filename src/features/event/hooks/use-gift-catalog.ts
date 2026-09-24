'use client'

import { useAuth } from '@features/auth'
import { keepFor } from '@shared/lib/api/query-client'
import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { giftApi, giftKeys } from '../api/gift-api'
import { type GiftPackage, splitGiftPackages } from '../api/gift-types'
import type { EventDetail } from '../api/types'

/**
 * **The gift catalogue for one broadcast's space.**
 *
 * ## Gated on three things, and each of them saves a request nobody wanted
 *
 * - **a channel id** — the catalogue is per space, and legacy's own fetch bails without one;
 * - **the creator allows gifts** (`allowed_donation`) — a tray that will not be drawn should not
 *   be fetched. That flag is a divergence from legacy and `api/types.ts` states it;
 * - **`enabled`**, which the studio passes as "something is actually playing". A reader looking at
 *   a paywall has no tray, so asking billy for one is a request made to draw nothing.
 *
 * Not gated on being **signed in**, and that is deliberate: a guest can see what a creator offers,
 * and pressing one is what raises the sign-in dialog (`useSendGift` composes `useRequireStars`,
 * which composes `useRequireAuth`). Refusing to *show* prices to a guest would hide the thing that
 * makes signing in worth it. Legacy gates its whole live session behind auth, so this is the
 * narrower rule rather than a copied one.
 *
 * ## Cached for an hour, in memory only
 *
 * A creator's gift list is edited by a human, rarely — `keepFor` gives the query a matching
 * `staleTime`/`gcTime` pair so a reader hopping between two of a creator's broadcasts does not
 * refetch it. It is **not** `persist`ed to disk: `include_exclusive` makes the answer depend on the
 * bearer (which products this account may be offered), and `CLAUDE.md`'s ETag rule is that an
 * account-scoped body never goes to disk.
 */
export const GIFT_CATALOG_STALE_MS = 60 * 60 * 1000

export interface GiftCatalogState {
    /** Everything the creator offers, exclusives included — the *Gifts* tab and the tray. */
    packages: GiftPackage[]
    /** The member-only subset — the *Exclusive* tab. A subset, not a partition. */
    exclusive: GiftPackage[]
    /** Nothing has answered yet. The tray holds rather than drawing an empty strip. */
    isLoading: boolean
    /**
     * The request failed.
     *
     * Kept separate from "the creator offers none", because the two are opposite instructions to
     * the reader and legacy collapses them: its `catch` sets `[]`, so one 502 renders as a creator
     * who accepts no gifts, silently, for the life of the page.
     */
    isError: boolean
}

export function useGiftCatalog({
    event,
    enabled = true,
}: {
    event: EventDetail
    enabled?: boolean
}): GiftCatalogState {
    const { activeId } = useAuth()
    const channelId = event.channel?.id ?? null
    const isOffered = event.allowed_donation && channelId !== null

    const query = useQuery({
        queryKey: giftKeys.packages(activeId, channelId, true),
        queryFn: ({ signal }) =>
            giftApi.getPackages({
                // Non-null by `enabled` — the query does not run without one.
                channelId: channelId as string,
                includeExclusive: true,
                accountId: activeId,
                signal,
            }),
        enabled: enabled && isOffered,
        ...keepFor(GIFT_CATALOG_STALE_MS),
    })

    const packages = useMemo(() => query.data ?? [], [query.data])
    const { all, exclusive } = useMemo(() => splitGiftPackages(packages), [packages])

    return {
        packages: all,
        exclusive,
        // A query that is switched off is not loading — it has simply not been asked, and a tray
        // waiting forever on a spinner is the failure that reads as a hung page.
        isLoading: enabled && isOffered && query.isPending,
        isError: query.isError,
    }
}
