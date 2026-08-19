'use client'

import { useAuth } from '@features/auth'
import { useQuery } from '@tanstack/react-query'
import { affiliateApi, affiliateKeys } from '../api/affiliate-api'
import type { CampaignStats, CurrentCampaign, Program } from '../api/types'

/**
 * A minute. These are read while a dialog is open and re-read when it reopens; the figures move
 * when a referral converts, which is not something to poll for behind a modal.
 */
const STALE_TIME = 60_000

/**
 * The three reads the affiliate dialog needs, in one hook.
 *
 * They are one hook rather than three because **every screen in the dialog needs more than one of
 * them** and they share a single gate: the list marks the promoted row, the detail decides
 * join-vs-switch from the current campaign, and the joined screen shows the stats. Three hooks
 * would mean three `enabled` flags to keep in step and three call sites deciding what "loading"
 * means.
 *
 * ## `enabled` is the dialog being open
 *
 * Legacy passes `open` into each of its SWR keys for the same reason. None of this is on screen
 * until the card is pressed, and the affiliate banner renders on every desktop page — fetching
 * three endpoints there would be three requests per navigation for a panel nobody opened.
 *
 * ## Loading is reported per read, and `null` is not "loading"
 *
 * `currentCampaign` is `null` for an account promoting nothing, which is the common case and a
 * final answer — so the screens key their layout off `isLoadingCurrent`, never off `null`. Legacy
 * conflates them and shows the join list for a beat to someone who has already joined.
 */
export interface AffiliateData {
    programs: Program[]
    currentCampaign: CurrentCampaign | null
    stats: CampaignStats | null
    isLoadingPrograms: boolean
    isLoadingCurrent: boolean
    /**
     * Reported separately from `stats` being `null`, because those are different answers and only
     * one of them ends.
     *
     * A failed stats request leaves `stats` at `null` forever. A screen that reads `null` as "still
     * loading" then holds a skeleton for the rest of the session — the same stuck-skeleton this hook
     * avoids on the other two reads, arrived at from the other direction. With the flag, `null` and
     * not loading means "not known", which the screens render as an em dash the way
     * `useBalanceDisplay` does.
     */
    isLoadingStats: boolean
    /** The program being promoted, as a plain id — what every screen actually compares against. */
    promotingId: string | null
}

export function useAffiliateData(enabled: boolean): AffiliateData {
    const { activeId, isAuthenticated } = useAuth()
    const on = enabled && isAuthenticated

    const programs = useQuery({
        queryKey: affiliateKeys.programs(activeId),
        queryFn: ({ signal }) => affiliateApi.getPrograms({ accountId: activeId, signal }),
        enabled: on,
        staleTime: STALE_TIME,
    })

    const current = useQuery({
        queryKey: affiliateKeys.current(activeId),
        queryFn: ({ signal }) => affiliateApi.getCurrentCampaign({ accountId: activeId, signal }),
        enabled: on,
        staleTime: STALE_TIME,
    })

    const stats = useQuery({
        queryKey: affiliateKeys.stats(activeId),
        queryFn: ({ signal }) => affiliateApi.getStats({ accountId: activeId, signal }),
        enabled: on,
        staleTime: STALE_TIME,
    })

    return {
        programs: programs.data ?? [],
        currentCampaign: current.data ?? null,
        stats: stats.data ?? null,
        // `on &&` so a disabled query reports `false` rather than the `true` TanStack leaves it at
        // forever — the stuck-skeleton bug legacy's Lives tab has.
        isLoadingPrograms: on && programs.isLoading,
        isLoadingCurrent: on && current.isLoading,
        isLoadingStats: on && stats.isLoading,
        promotingId: current.data?.program?.id ?? null,
    }
}
