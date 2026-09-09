'use client'

import { useAuth } from '@features/auth'
import { useBalance, useCurrency } from '@features/balance'
import { channelKeys, useChannelStats, useMyChannel } from '@features/channel'
import type { Currency } from '@shared/lib/money'
import { useQueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'

/**
 * Everything `/monetization` prints: the headline revenue figure, the withdrawable balance, and the
 * unit both are shown in.
 *
 * ## Three sources, and each one is already somebody else's
 *
 * - **Revenue** is `income_usd` off `GET /analytics/v2/channel/{slug}/stats/`, read for the *reader's
 *   own* channel — legacy's `useHub` does exactly this (`getChannelStats(myChannel.slug)`) and there
 *   is no monetization-specific endpoint behind this screen. Going through `features/channel`'s hook
 *   rather than a second model here means the hub and the creator's own space share one query key, so
 *   arriving from either direction costs one request and the two can never disagree.
 * - **Balance** is `features/balance`'s provider — the same figure the shell and the account drawer
 *   show, so this screen cannot contradict them and mounting it costs no extra request.
 * - **The currency** is `features/balance`'s `useCurrency()`, called with no argument: this screen
 *   prints two money figures, so the list and the rate go out with the page. (The drawer's copy of the
 *   same switcher gates them on being open; see the hook.)
 *
 * ## Both figures are converted, and both are held in USD
 *
 * Legacy multiplies each by `exchangeRate` before formatting, and that is the rule everywhere in this
 * app: earnings are *held* in USD and *displayed* in the reader's chosen unit. The conversion is left
 * to the caller (`convertFromUsd` + `formatFiatAmount`) rather than done here, so this hook returns
 * numbers and the view decides how they read — which is what keeps it testable without `Intl`.
 *
 * ## Known, loading and failed are three states, not two — for each figure separately
 *
 * `/my-wallet` prints `—` rather than `0` when the balance is unknown, and the same rule applies to
 * the revenue figure: a creator who sees `$0.00` because a request failed reads it as "I earned
 * nothing this month". **And a failure is not an empty answer** — the two are reported apart because
 * the screen does different things with them: an empty answer is what the "start earning" prompt is
 * for, a failure is what the retry strip is for, and legacy conflates them (its `catch` leaves
 * `incomeUsd` at `0`, so a 502 shows an earning creator a banner telling them to start earning).
 */
export interface MonetizationHubState {
    /** Revenue in USD. `0` when unknown — check `isRevenueKnown` before showing it. */
    revenueUsd: number
    isRevenueKnown: boolean
    isRevenueLoading: boolean
    /** The stats read failed. Distinct from "not known yet" — see the note above. */
    isRevenueError: boolean
    /** Ask for the figure again, for the retry strip. */
    refreshRevenue: () => Promise<void>
    /** Withdrawable balance in USD. Same rule. */
    balanceUsd: number
    isBalanceKnown: boolean
    isBalanceLoading: boolean
    /** The unit both figures are shown in, and the USD → unit rate. */
    currency: Currency
    rate: number
    /**
     * Whether there is a real account behind the screen.
     *
     * The hub is a creator's own dashboard: every figure on it is bearer-derived, and the four
     * methods are things *you* switch on. A guest gets the signed-out wall rather than a card of
     * dashes — which is the same call `/my-wallet` makes, and the *action* gate this repo's rule asks
     * for rather than a redirect.
     *
     * ⚠ It is `isAuthenticated`, **not** `Boolean(myChannel)`. The two look interchangeable here
     * because `MyChannelProvider` makes a real account create a channel before it can use the app —
     * but they answer different questions, and gating on the channel means a signed-in account whose
     * `my-channel/` read came back `null` (or is exempt from the onboarding gate) is shown *"Sign in
     * to see your monetization"* while signed in. That reader has no way to act on the instruction.
     * With no slug the figure is simply not known and prints `—`, which is the honest version.
     */
    isSignedIn: boolean
    /**
     * True while the answer to `isSignedIn` could still change.
     *
     * **It folds in `isBootstrapping`, and that is load-bearing rather than tidy.** Every
     * account-scoped query in this app is `enabled: isAuthenticated`, so during the session bootstrap
     * it is *disabled* — and a disabled query is not loading. Read naively, a signed-in creator's
     * first paint is therefore "no account", which renders the signed-out wall for the length of the
     * bootstrap and then replaces it with their dashboard. `BalanceProvider` folds the same flag into
     * its own `isLoading` for the same reason (`isBootstrapping || (query.isLoading &&
     * isAuthenticated)`); this is that, one level up.
     */
    isSessionLoading: boolean
}

export function useMonetizationHub(): MonetizationHubState {
    const { activeId, isAuthenticated, isBootstrapping } = useAuth()
    const { myChannel, isLoading: isChannelLoading } = useMyChannel()
    const { usd: balanceUsd, isKnown: isBalanceKnown, isLoading: isBalanceLoading } = useBalance()
    const { currency, rate } = useCurrency()
    const queryClient = useQueryClient()

    const slug = myChannel?.slug ?? ''
    const {
        stats,
        isLoading: isStatsLoading,
        isError: isStatsError,
    } = useChannelStats(slug, { enabled: Boolean(slug) })

    const refreshRevenue = useCallback(async () => {
        if (!slug) return
        await queryClient.invalidateQueries({ queryKey: channelKeys.stats(slug, activeId) })
    }, [queryClient, slug, activeId])

    const isSessionLoading = isBootstrapping || isChannelLoading

    return {
        revenueUsd: stats?.income_usd ?? 0,
        // A channel with no stats body yet is not a zero — see the note above.
        isRevenueKnown: Boolean(stats) && !isStatsError,
        /*
         * The session counts as revenue loading, because until it settles there is no slug to ask
         * with. Without that the card prints `—` and `MonetizationView` shows the "start earning"
         * prompt for the length of the bootstrap, both of which are then taken away — a card and a
         * banner appearing and vanishing under the reader.
         *
         * The second half is the opposite guard: not waiting on anything is not loading. With the
         * session settled and still no slug the query never runs, and reporting it as loading would
         * leave the card shimmering forever for an account that has no channel.
         */
        isRevenueLoading: isSessionLoading || (Boolean(slug) && isStatsLoading),
        isRevenueError: isStatsError,
        refreshRevenue,
        balanceUsd,
        isBalanceKnown,
        isBalanceLoading,
        currency,
        rate,
        isSignedIn: isAuthenticated,
        isSessionLoading,
    }
}
