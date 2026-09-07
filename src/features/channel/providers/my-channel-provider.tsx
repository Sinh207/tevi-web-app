'use client'

import { useAuth } from '@features/auth'
import { useSocketEvent } from '@features/realtime'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { usePathname } from 'next/navigation'
import { createContext, useCallback, useContext, useMemo } from 'react'
import { channelApi, channelKeys, forgetMyChannelCache } from '../api/channel-api'
import type { Channel } from '../api/types'
import { CreateChannelGate } from '../components/create-channel-gate'
import { isOnboardingExemptPath, onboardingGate } from '../lib/onboarding-gate'

/**
 * The signed-in account's own channel, available everywhere.
 *
 * ## Why this is global and not an on-demand hook
 *
 * Two reasons, and the first is a product rule rather than a convenience:
 *
 * 1. **A real account with no channel must create one before it can use the app.** Posting,
 *    streaming, messaging and earning all belong to the channel, so legacy renders
 *    `<CreateMyChannel/>` *instead of the whole app* until one exists. A gate that every route is
 *    subject to has to live above every route — see `lib/onboarding-gate.ts` for the decision table.
 * 2. **`myChannel` is read almost everywhere.** Legacy consumes it in roughly eighty files: the nav
 *    avatar, post composer, comments, DMs, membership, wallet, monetization. Each of those asking
 *    independently means either N requests or N copies of the same `enabled` bookkeeping.
 *
 * It sits directly after `AuthProvider` because it is a function of the active account and nothing
 * else — it needs `activeId` and it needs to know whether the session is anonymous.
 *
 * ## What is deliberately *not* copied from legacy
 *
 * Legacy's provider ends with `isLoading ? null : isCreateMyChannel ? <CreateMyChannel/> : children`,
 * and both branches of that are bugs this one does not have:
 *
 * - **It blanks the entire app** while the request is in flight — every cold load, every user,
 *   including everyone who already has a channel. Nothing else in this codebase blocks the tree on a
 *   session request (`isBootstrapping` is consumed by no UI at all), so copying it would make this the
 *   first. `onboardingGate` returns `'open'` while unknown: the app renders, and the rare brand-new
 *   account sees it for a moment before onboarding replaces it.
 * - **It pushes to `/500`** on any status that is neither 200 nor 404, so one flaky endpoint takes the
 *   whole app to an error page. Here an error is simply not an answer, and the query retries.
 *
 * ## Multi-account
 *
 * Legacy holds one `myChannel`, because it has one session. This app holds up to ten, so the query is
 * keyed by `activeId` — switching accounts re-reads rather than re-deriving, and account B can never
 * be shown account A's channel. `staleTime` is five minutes because a creator's own slug and premium
 * flag change on the order of never, and this is read on every navigation.
 */
interface MyChannelValue {
    /** `undefined` while unknown, `null` when the account has no channel. */
    myChannel: Channel | null | undefined
    /** True only while a request could still change the answer. */
    isLoading: boolean
    isError: boolean
    /** Re-read after a write (publish, rename, privacy change). */
    refresh: () => Promise<void>
    // ── derived, so ~80 future call sites do not each re-derive them ──
    /** The account has a channel. Narrower than `Boolean(myChannel)` only in intent. */
    hasChannel: boolean
    isPremium: boolean
    isUnpublished: boolean
    isProtected: boolean
    /** The custom verified-badge image, or `null`. Legacy's `verifiedTickBadge`. */
    verifiedTickBadge: string | null
}

const MyChannelContext = createContext<MyChannelValue | null>(null)

export function MyChannelProvider({ children }: { children: React.ReactNode }) {
    const { activeId, isAuthenticated } = useAuth()
    const queryClient = useQueryClient()
    const pathname = usePathname()

    const query = useQuery({
        queryKey: channelKeys.myChannel(activeId),
        queryFn: () => channelApi.getMyChannel(activeId),
        /**
         * `isAuthenticated` already excludes anonymous sessions (`id && !anonymous`, same definition
         * as legacy), so no extra `&& !isAnonymous` — writing one would imply otherwise and mislead
         * the next reader. An anonymous session has no channel and never will, so asking is a wasted
         * round trip on the most common kind of visit.
         */
        enabled: isAuthenticated && Boolean(activeId),
        staleTime: 5 * 60_000,
    })

    const myChannel = query.data as Channel | null | undefined

    const refresh = useCallback(async () => {
        await queryClient.invalidateQueries({ queryKey: channelKeys.myChannel(activeId) })
    }, [queryClient, activeId])

    /**
     * The server says this account's Premium state changed — it was bought, gifted or lapsed.
     *
     * The payload is ignored for the reason `BalanceProvider` gives about its own event: a socket frame
     * is a signal, not a source. The re-read of `my-channel` is what `isPremium` and the animated
     * avatar are derived from, so the ring, the crown and the drawer's gold card follow without any of
     * them knowing a socket exists.
     *
     * ⚠ **The ETag is evicted first, and `refresh()` alone was not enough.** This handler used to call
     * it directly, which sends a conditional GET: the service answers `304` because *its* validator
     * has not moved, `apiClient` replays the body it already had, and `is_premium` stays `false` for an
     * account that has just paid. `forgetMyChannelCache` carries the whole argument and **B72** is
     * where the shape was first found — on two other endpoints, which is why this one was missed.
     * `usePremiumSync` does the same thing for the expiry date; this is the same news about the same
     * purchase, read from a different body.
     *
     * The eviction is **awaited before** the invalidate, because `invalidateQueries` starts the
     * request synchronously — evicting afterwards would drop the record the request had already read
     * on its way out.
     *
     * Legacy patches `myChannel.is_premium` in place from the payload, which is why its verified badge
     * and avatar ring can disagree with the rest of the channel body until the next fetch.
     */
    useSocketEvent('premium_info', () => {
        void (async () => {
            await forgetMyChannelCache(activeId)
            await refresh()
        })()
    })

    const value = useMemo<MyChannelValue>(
        () => ({
            myChannel,
            isLoading: query.isLoading,
            isError: query.isError,
            refresh,
            hasChannel: Boolean(myChannel),
            isPremium: Boolean(myChannel?.is_premium),
            isUnpublished: myChannel?.privacy === 'unpublished',
            isProtected: myChannel?.privacy === 'protected',
            verifiedTickBadge: myChannel?.verified_tick_badge?.image ?? null,
        }),
        [myChannel, query.isLoading, query.isError, refresh],
    )

    const gate = onboardingGate({
        isAuthenticated,
        myChannel,
        isLoading: query.isLoading,
        isError: query.isError,
        isExemptRoute: isOnboardingExemptPath(pathname),
    })

    return (
        <MyChannelContext.Provider value={value}>
            {/*
             * The context is provided in **both** branches on purpose: the onboarding screen itself
             * reads `useMyChannel()` to know it is the one being onboarded, and a provider that
             * withheld its own value from its own gate would be a trap for whoever adds the next
             * thing to that screen.
             */}
            {gate === 'needs-channel' ? <CreateChannelGate /> : children}
        </MyChannelContext.Provider>
    )
}

/**
 * The active account's own channel.
 *
 * Throws outside the provider rather than returning a plausible empty value: this is mounted at the
 * root, so being outside it means a component was rendered somewhere it cannot work — and a silent
 * `undefined` there would surface much later as "the avatar is missing" rather than as the real
 * mistake.
 */
export function useMyChannel(): MyChannelValue {
    const value = useContext(MyChannelContext)
    if (!value) {
        throw new Error(
            'useMyChannel must be used inside MyChannelProvider (see app/session-providers.tsx)',
        )
    }
    return value
}
