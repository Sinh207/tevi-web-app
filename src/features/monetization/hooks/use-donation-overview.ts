'use client'

import { useAuth } from '@features/auth'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { creatorDonationApi, creatorDonationKeys } from '../api/donation-api'
import type { DonationRow } from '../api/donation-types'
import { type DonationRange, donationRangeBounds } from '../lib/donation-setting'

/**
 * The overview's two reads — the supporter count, and the donations themselves — for one date range.
 *
 * ## Two queries, not one `Promise.all`
 *
 * Legacy fetches both in a single `Promise.all` behind one `isLoading`, which makes the screen as
 * slow as its slower half and gives a failed summary the power to blank a list that arrived. Here
 * they are two queries with two keys: the list renders the moment it lands, the card shows its own
 * failure, and a range already visited is served from cache rather than re-requested.
 *
 * ## The range lives here, and it is the key
 *
 * `range` is UI state (Zustand's job would be a store nobody else reads, so `useState`), but it is
 * also part of both query keys — which is what stops an in-flight request for *last 7 days*
 * resolving into a view the reader has already switched to *this month*. Legacy has one `donations`
 * array and one `setDonations`, so exactly that race writes the wrong rows under the wrong label.
 *
 * ## The supporter figure is the **summary's**, and the count is only a fallback
 *
 * `unique_supporter_count` and `results.length` answer different questions — three donations from
 * one person is `1` and `3` — so the card prints the summary whenever it is known and falls back to
 * the donations `count` only when the summary read failed. Legacy writes
 * `summary?.unique_supporter_count || totalDonations || 0`, whose `||` also swallows a **legitimate
 * zero** from the summary; the difference shows only when the two endpoints disagree, and the
 * summary is the one that was asked the question.
 *
 * ## `enabled` is the caller's, because the answer is on the screen before this
 *
 * A creator with no offer has no supporters and no donations, and asking anyway is two 404s or two
 * empty pages on a screen already showing a wall. `useMyDonationSetting`'s `hasSetting` is what
 * decides, exactly as `useSubscribers` takes `hasTier`.
 */
export interface DonationOverviewState {
    range: DonationRange
    setRange: (range: DonationRange) => void
    /** Epoch **milliseconds** for the chosen range — what the analytics banner deep-links with. */
    bounds: { startMs: number; endMs: number }
    /** Unique supporters in the range, or `null` while neither read has answered. */
    supporterCount: number | null
    rows: DonationRow[]
    isLoading: boolean
    isError: boolean
    isEmpty: boolean
    refetch: () => void
}

export function useDonationOverview({ enabled }: { enabled: boolean }): DonationOverviewState {
    const { activeId, isAuthenticated } = useAuth()
    const [range, setRange] = useState<DonationRange>('7d')

    const active = enabled && isAuthenticated && Boolean(activeId)

    const summary = useQuery({
        queryKey: creatorDonationKeys.summary(activeId, range),
        queryFn: ({ signal }) =>
            creatorDonationApi.getSummary({ range, accountId: activeId, signal }),
        enabled: active,
    })

    const donations = useQuery({
        queryKey: creatorDonationKeys.donations(activeId, range),
        queryFn: ({ signal }) =>
            creatorDonationApi.getDonations({ range, accountId: activeId, signal }),
        enabled: active,
    })

    const page = donations.data
    const rows = page?.results ?? []

    /**
     * The server sent rows and **not one of them parsed** — which is not an empty range.
     *
     * This is what `ParsedDonationPage.received` is for, and leaving it unread was the whole reason
     * it existed being lost: `results.length === 0` is true both when a creator had no supporters in
     * the period and when every row they *did* have was unreadable, and the two print opposite
     * things. The second showing "No one supported you in the last 7 days" is the client telling a
     * creator they earned nothing — the one sentence on this screen that must never be guessed.
     *
     * It joins `isError` rather than becoming a fourth state: the panel's failure branch already
     * says the right thing ("Your supporters could not be loaded") and offers the retry. A retry
     * will re-fetch the same unreadable payload, which is honest — the alternative is a blank panel
     * with no way to ask again.
     *
     * `received > 0` and not `count > 0`: `count` is the server's total across the whole range and
     * can be non-zero while *this* page is legitimately empty. `received` is what this response
     * actually carried.
     */
    const isUnreadable = Boolean(page && page.received > 0 && page.results.length === 0)

    /*
     * Recomputed per render on purpose, and it is cheap. The alternative — memoising on `range` —
     * would freeze `now` at the first render of the screen, so a dashboard left open across midnight
     * would label its range with yesterday's dates and deep-link analytics to yesterday's window.
     */
    const bounds = donationRangeBounds(range)

    /**
     * The **summary's** figure, with the donation `count` as a fallback only once the summary has
     * actually settled.
     *
     * The middle branch is the fix rather than a nicety: without it the fallback also fires while the
     * summary is still *in flight*, so the card prints the donation count under a label that says
     * "Total supporters" and then swaps to a different number when the summary lands. Three donations
     * from one person is `3` then `1` — a figure about somebody's audience, wrong, then corrected,
     * with no indication either was provisional. `null` holds the placeholder instead.
     *
     * A summary that settled **without a usable body** (the model answers `null`) still falls
     * through to the count: at that point it is the best figure in hand rather than a guess.
     */
    const supporterCount = summary.data
        ? summary.data.unique_supporter_count
        : summary.isLoading
          ? null
          : (page?.count ?? null)

    return {
        range,
        setRange,
        bounds,
        supporterCount,
        rows,
        /*
         * The **list's** loading state, not both reads'. The card carries its own placeholder, and
         * holding the rows back for a summary they do not depend on is legacy's single-spinner
         * behaviour — the thing the two-query split above exists to undo.
         */
        isLoading: donations.isLoading,
        isError: donations.isError || isUnreadable,
        isEmpty: !donations.isLoading && !donations.isError && !isUnreadable && rows.length === 0,
        refetch: () => {
            void summary.refetch()
            void donations.refetch()
        },
    }
}
