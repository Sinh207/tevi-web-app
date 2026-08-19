'use client'

import { useAuth } from '@features/auth'
import { useSocketEvent } from '@features/realtime'
import { eventBus } from '@shared/lib/event-bus'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createContext, useCallback, useContext, useMemo } from 'react'
import { balanceApi, balanceKeys } from '../api/balance-api'
import type { Balance } from '../api/types'
import { normalizeBalance } from '../api/types'

/**
 * The signed-in account's balance, available everywhere.
 *
 * ## Why this is global and not an on-demand hook
 *
 * The same two reasons `MyChannelProvider` is, and the first is a product rule rather than a
 * convenience:
 *
 * 1. **Star is what the product is priced in.** Sending a gift, unlocking a paywalled post, joining a
 *    membership, entering a paid live — each of those has to know, *before* it runs, whether this
 *    account can afford it, and offer a top-up when it cannot. That check has to be available wherever
 *    a price is, which is most of the app. A provider is what makes `useRequireStars` a one-liner at
 *    each of those call sites instead of a query plus a comparison plus a fallback.
 * 2. **The figure is read by the app shell.** The account drawer's balance card and the mobile top
 *    bar's Star pill are mounted on **every** route.
 *
 * It sits directly after `AuthProvider` because it is a function of the active account and nothing
 * else — it needs `activeId` and it needs to know whether the session is anonymous.
 *
 * ## Why a provider when TanStack already dedupes
 *
 * It would work as a bare `useQuery` in each consumer — three subscribers to one key produce one
 * request. The provider earns its place for what it adds *around* the query: one definition of
 * `isKnown` (see below), one `refresh` that the spend paths call after a write, and `hasEnoughStars`,
 * which is a **product rule** and must not be re-derived per call site. Legacy needed a context for
 * the opposite reason — it had no query cache — and paid for it with a 467-line provider that also
 * owned seven checkout dialogs. This one owns a query and three derived values.
 *
 * Unlike `MyChannelProvider` it owns **no gate**: a missing balance never replaces the app. It is a
 * number that is not known yet.
 *
 * ## What this feature deliberately does not do
 *
 * It does not own a screen, a ledger, a currency picker or a transaction filter. `/my-star` and
 * `/my-wallet` are their own features, each reading its own endpoint on the same service. The only
 * thing they take from here is the balance, the money vocabulary and the spend gate — through the
 * barrel, like any other feature.
 */
interface BalanceValue {
    /** `null` while unknown — never a fabricated zero. See `isKnown`. */
    balance: Balance | null
    /** Star (`TVS`). `0` when unknown, so arithmetic is always safe; check `isKnown` before showing it. */
    star: number
    /** Withdrawable earnings in USD (`TEVI`). Same rule as `star`. */
    usd: number
    /**
     * Whether the figures are real.
     *
     * The distinction this provider exists to make exactly once: **a zero is a claim about somebody's
     * money**, and neither "we have not asked yet" nor "we asked and it failed" is that claim. A
     * creator with 40,000 Star must never be told they have none — not for a frame, not on the first
     * thing they see when they open the menu. Consumers render `—` when this is false; the spend gate
     * refuses to decide.
     */
    isKnown: boolean
    isLoading: boolean
    isError: boolean
    /** Re-read after anything that spends or adds Star. */
    refresh: () => Promise<void>
    /**
     * Whether `cost` Star can be spent right now.
     *
     * `false` when the balance is not known, which is the safe direction: offering a top-up to
     * somebody who could have paid is a wasted step, while letting a spend through on an unknown
     * balance is a request the backend has to refuse and a failure the reader cannot explain.
     */
    hasEnoughStars: (cost: number) => boolean
    /** How many Star short a spend is — `0` when it is affordable. Drives the top-up copy. */
    starShortfall: (cost: number) => number
}

const BalanceContext = createContext<BalanceValue | null>(null)

export function BalanceProvider({ children }: { children: React.ReactNode }) {
    const { activeId, isAuthenticated, isBootstrapping } = useAuth()
    const queryClient = useQueryClient()

    const query = useQuery({
        queryKey: balanceKeys.balance(activeId),
        queryFn: ({ signal }) => balanceApi.getBalance({ accountId: activeId, signal }),
        /**
         * `isAuthenticated` is already `id && !anonymous` (the same definition as legacy), so no extra
         * `&& !isAnonymous` — writing one would imply otherwise and mislead the next reader. The app
         * always keeps an anonymous Firebase session, so `currentUser` being present says nothing.
         *
         * A guest has no balance and never will, so asking is a wasted round trip on the most common
         * kind of visit — and this provider is mounted above every route, so it would be one per
         * navigation. Same reasoning, verbatim, as `MyChannelProvider`'s.
         */
        enabled: isAuthenticated && Boolean(activeId),
        /*
         * The app default (60s). Deliberately not longer: this is the number a spend is checked
         * against, so a stale figure is a wrong affordability answer. Not shorter either — the spend
         * paths call `refresh()`, and the socket `balance_change` event below invalidates it too.
         */
    })

    const balance = query.data ?? null
    const isKnown = Boolean(balance) && !query.isLoading && !query.isError

    const refresh = useCallback(async () => {
        await queryClient.invalidateQueries({ queryKey: balanceKeys.balance(activeId) })
    }, [queryClient, activeId])

    /**
     * The server says the balance moved.
     *
     * **The payload is ignored on purpose.** It carries the new balances, and writing them into the
     * cache is the one thing this feature's barrel says not to do: a socket frame has no ordering
     * guarantee against the HTTP responses in flight beside it, so trusting it can move the figure
     * *backwards* — and this is the number a spend is checked against. The endpoint that owns it is
     * asked instead.
     *
     * **`balanceKeys.all`, not `refresh()`.** `refresh` is the narrow one — it invalidates the figure
     * alone, which is right for a caller that knows only the figure moved. A `balance_change` frame is
     * the broad case: Star was spent or added, so the **ledgers explain it too**, and `balance-api.ts`
     * states the agreement the three features share — one invalidation of `all` refreshes the figure
     * *and* the history under it. Narrowing it here would leave a reader sitting on `/my-star` with a
     * new total and a transaction list that does not mention why.
     *
     * Safe to subscribe unconditionally: the room only opens for a real account, so for a guest this
     * never fires.
     */
    useSocketEvent('balance_change', payload => {
        /*
         * The **one** field of a socket frame this app reads, and the exception is narrow on purpose:
         * the *size* of a change is the thing a refetch cannot recover. By the time the new figure
         * lands the old one is gone, so `-120 ★` can only be known from the frame that announced it.
         *
         * It is used for a flash and nothing else — emitted on the bus, drawn, forgotten. The figure
         * itself still comes from the invalidation below. `event-bus.ts` has the full reasoning.
         *
         * Parsed with the endpoint's own normaliser: the frame carries `{ balances: [...] }`, the same
         * shape `billing/balance/` answers, so there is one place that knows how to read a Star amount
         * off the wire rather than two that can drift.
         */
        const previous = queryClient.getQueryData<Balance>(balanceKeys.balance(activeId))
        if (previous) {
            const delta = normalizeBalance(payload).star - previous.star
            // Zero is not an event. A frame can restate the same balance — a movement in the *other*
            // unit, or a redelivery — and a flash of `0 ★` reads as a bug.
            if (delta !== 0) eventBus.emit('balance:star-changed', { delta })
        }

        void queryClient.invalidateQueries({ queryKey: balanceKeys.all })
    })

    const value = useMemo<BalanceValue>(() => {
        const star = balance?.star ?? 0
        return {
            balance,
            star,
            usd: balance?.usd ?? 0,
            isKnown,
            /*
             * `isBootstrapping` is folded in: a disabled query is not `isLoading` as far as TanStack
             * is concerned, and the session bootstrap is exactly the window in which the shell should
             * show a placeholder rather than a figure. Without this the drawer would flash `—` for a
             * signed-in reader on every cold load.
             */
            isLoading: isBootstrapping || (query.isLoading && isAuthenticated),
            isError: query.isError,
            refresh,
            hasEnoughStars: (cost: number) => {
                if (!isKnown) return false
                if (!Number.isFinite(cost)) return false
                // A zero or negative price is affordable by definition — a free gift is still a gift,
                // and refusing it would gate an action that costs nothing behind a top-up.
                if (cost <= 0) return true
                return star >= cost
            },
            starShortfall: (cost: number) => {
                if (!Number.isFinite(cost) || cost <= 0) return 0
                // `0` when unknown as well as when affordable: a shortfall is a figure shown to a
                // person ("you need 120 more"), and inventing one from a balance we do not have would
                // put a made-up number in that sentence.
                if (!isKnown) return 0
                return Math.max(0, Math.ceil(cost - star))
            },
        }
    }, [
        balance,
        isKnown,
        isBootstrapping,
        isAuthenticated,
        query.isLoading,
        query.isError,
        refresh,
    ])

    return <BalanceContext.Provider value={value}>{children}</BalanceContext.Provider>
}

/**
 * The active account's balance.
 *
 * Throws outside the provider rather than returning a plausible empty value: it is mounted at the
 * root, so being outside it means a component was rendered somewhere it cannot work — and a silent
 * zero there would surface much later as "the gift button says I cannot afford it" rather than as the
 * real mistake. Same call, same reasoning, as `useMyChannel`.
 */
export function useBalance(): BalanceValue {
    const value = useContext(BalanceContext)
    if (!value) {
        throw new Error(
            'useBalance must be used inside BalanceProvider (see app/session-providers.tsx)',
        )
    }
    return value
}
