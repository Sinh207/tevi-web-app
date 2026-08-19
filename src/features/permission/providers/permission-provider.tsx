'use client'

import { useAuth } from '@features/auth'
import { useSocketEvent } from '@features/realtime'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createContext, useCallback, useContext, useMemo } from 'react'
import { permissionApi, permissionKeys } from '../api/permission-api'
import type { ChannelPermission, FiatAgency } from '../api/types'
import {
    allows,
    type Capability,
    type CapabilityState,
    capabilityState,
    rawGrant,
} from '../lib/capabilities'

/**
 * What the signed-in account is **allowed to do**, available everywhere.
 *
 * ## Why this is a provider and not a hook each screen calls
 *
 * Same two reasons as `BalanceProvider`, and the first is again a product rule rather than a
 * convenience:
 *
 * 1. **A grant is read where the feature is *offered*, not only where it runs.** The account drawer
 *    has to know whether to list Star Transfer and Payout at all; the screens behind them have to gate
 *    themselves; the transfer history has to know whether to load. That is one flag read in three
 *    places per capability, on every route, and legacy proves the point by getting it inconsistently
 *    wrong in each.
 * 2. **Fail-closed is a rule, not a default.** "Unknown means no" and "a network failure is not a
 *    denial" are two decisions that must be made identically at every gate. A rule re-derived per call
 *    site is a rule that will be got wrong at one of them — and here being wrong in the permissive
 *    direction means showing an account a money-moving surface it has no grant for.
 *
 * It sits directly inside `AuthProvider`'s subtree because it is a function of the active account and
 * nothing else. It needs `activeId` and it needs to know whether the session is real.
 *
 * ## What it fixes in legacy
 *
 * `providers/permission/index.js` is 88 lines and four of its behaviours are load-bearing bugs:
 *
 * - **no account scoping.** One module-level state, overwritten by whatever lands. Switching accounts
 *   mid-flight files account A's grants under account B — which here is not stale data but a payout
 *   console offered to an account that has no payout grant. Keying the query on `activeId` makes an
 *   answer only ever land under the account it was asked for.
 * - **a failed request is indistinguishable from a denial.** `isLoading` is set false after the fetch
 *   whether it succeeded or not, and `catch` sets the grants to `null`. So `/star-transfer` renders
 *   **Access denied** to an agency whose request hit a 502, with no retry. Hence `isKnown` and
 *   `capabilityState` — see `lib/capabilities.ts`.
 * - **it is mounted only when authenticated** (`providers/authenticatedProviders/index.js` returns
 *   bare children otherwise), so every consumer outside a session reads `{}` from a
 *   `createContext({})` — `isLoading` is `undefined` there, which is falsy, which is why a guest lands
 *   on Access denied instantly rather than on a sign-in prompt. This provider is mounted for guests
 *   too and simply asks for nothing; `useCapability` reports `denied`, and a guest gets the sign-in
 *   path.
 * - **grants are re-fetched on every mount** because that mount is conditional and churns on sign-in.
 *   Here it is a query with a `staleTime`.
 *
 * ## What it deliberately does not do
 *
 * It owns no screen, no dialog and no other feature's data. It does not know what a payout
 * *transaction* is, and it must not grow to: `fiatAgency.payoutMethods` is a snapshot for gating and
 * first paint, and the payout screen re-reads `payout/agency-info/` before it writes anything back
 * (`api/types.ts` says why). It also holds **no roles and no admin model** — this endpoint answers
 * about features, not about who somebody is.
 */
interface PermissionValue {
    /**
     * The parsed grants, or `null` while unknown — never a fabricated all-denied object.
     *
     * `null` is the same distinction `BalanceProvider` draws with its balance, for a sharper reason: an
     * all-false `ChannelPermission` is a *legitimate* answer (it is what an ordinary creator's `{}`
     * parses to), so a consumer holding one cannot tell it apart from a failure. `null` can only mean
     * "no answer yet".
     */
    permission: ChannelPermission | null
    /**
     * Whether an answer has arrived for this account.
     *
     * `false` covers "not asked" (guest, bootstrapping), "in flight" and "asked and failed with
     * nothing cached". It stays **true** through a failed *refetch*, because the grants in hand are
     * still an answer — see the note at the assignment. Anything that decides *access* uses `can` or
     * `state`, which fold this in; `isKnown` is for a consumer that needs to say why, such as a retry
     * panel.
     */
    isKnown: boolean
    isLoading: boolean
    isError: boolean
    /**
     * Whether the account may do this, right now. **Fails closed** while unknown.
     *
     * The one call a menu row, a button or a nav item makes. It cannot distinguish a denial from a
     * failure, which is correct for a *list*: an unlisted row is a row somebody does not miss, while a
     * listed row leading to a screen that refuses them is a dead end.
     */
    can: (capability: Capability) => boolean
    /**
     * The four-way state, for a **screen** that must show a skeleton, a retry, the feature or the
     * denial. `useCapability` is the ergonomic form of this.
     */
    state: (capability: Capability) => CapabilityState
    /** The payout-agency grant and its configuration. Empty and inactive while unknown. */
    fiatAgency: FiatAgency
    /**
     * Read a grant that has no `Capability` entry yet, e.g. one the backoffice added after this client
     * shipped. Prefer adding it to `CAPABILITIES` — this is for a one-off and for probing.
     */
    grant: (feature: string, flag?: 'allowed' | 'is_active' | 'enabled') => boolean
    /** Re-read the grants. Call after anything that could change them. */
    refresh: () => Promise<void>
}

const PermissionContext = createContext<PermissionValue | null>(null)

const NO_AGENCY: FiatAgency = { isActive: false, name: '', payoutMethods: [] }

export function PermissionProvider({ children }: { children: React.ReactNode }) {
    const { activeId, isAuthenticated, isBootstrapping } = useAuth()
    const queryClient = useQueryClient()

    const query = useQuery({
        queryKey: permissionKeys.channel(activeId),
        queryFn: ({ signal }) =>
            permissionApi.getChannelPermission({ accountId: activeId, signal }),
        /**
         * `isAuthenticated` is already `id && !anonymous`, so no extra `&& !isAnonymous` — writing one
         * would imply otherwise and mislead the next reader. The app always keeps an anonymous session,
         * so a present `currentUser` says nothing.
         *
         * A guest has no grants and never will, and this provider is mounted above every route, so
         * asking would be a wasted round trip on the commonest kind of visit — repeated on every
         * navigation. Same reasoning, verbatim, as `BalanceProvider` and `MyChannelProvider`.
         */
        enabled: isAuthenticated && Boolean(activeId),
        /**
         * Five minutes, like `my-channel` and unlike the balance's sixty seconds.
         *
         * The difference is what moves the value. A balance moves because the reader spends, which is
         * *their own* action and can happen at any moment. Grants move because somebody in the
         * backoffice switches a feature on for this account — rare, external, and not something the
         * reader is waiting on mid-session. Legacy fetches once per mount and never revalidates at all.
         *
         * A grant that has just been given lands on the next cold load, or on `refresh()`, or on the
         * `premium_info` frame below. That is the right trade against a request per navigation for a
         * value that changes monthly.
         */
        staleTime: 5 * 60_000,
    })

    const permission = query.data ?? null
    /*
     * Simply "an answer arrived for this account" — `query.data` is only ever set by a fetch that
     * succeeded under *this* key, so nothing else needs to be conjunct.
     *
     * Deliberately **not** `&& !query.isError`, which is what `BalanceProvider` writes. The two
     * differ because the risk differs: a stale balance is a wrong affordability answer, so it wants a
     * hard "trustworthy right now" signal; a stale *grant* is almost certainly still true, because
     * grants move when somebody in the backoffice moves them. Folding the error in here would make a
     * failed background refetch tell a reader their permissions "could not be checked" while the
     * client is holding a perfectly good answer.
     */
    const isKnown = permission !== null

    const refresh = useCallback(async () => {
        await queryClient.invalidateQueries({ queryKey: permissionKeys.channel(activeId) })
    }, [queryClient, activeId])

    /**
     * The account's Premium state changed — bought, gifted or lapsed.
     *
     * Grants are re-read because Premium is the one entitlement input that **changes mid-session**, on
     * an event the reader themself triggered: they buy Premium in one tab and expect the app to stop
     * telling them they cannot do a thing. Whether this endpoint's grants are actually premium-derived
     * is B41 — but the cost of asking is one request on a rare frame, and the cost of not asking is a
     * reader who paid and has to reload.
     *
     * The payload is ignored, per the app's rule: a socket frame is a signal, never a source. It
     * carries a Premium state and nothing about grants anyway.
     *
     * Safe to subscribe unconditionally — the room only opens for a real account, so for a guest this
     * never fires.
     */
    useSocketEvent('premium_info', () => {
        void refresh()
    })

    /*
     * "There is no answer yet and one is still coming."
     *
     * `isBootstrapping` is folded in because a disabled query is not `isLoading` as far as TanStack
     * is concerned, and the session bootstrap is exactly the window in which a gated screen must
     * show a skeleton rather than a denial. Without it, a signed-in reader opening `/star-transfer`
     * cold gets **Access denied** for a frame — legacy's bug arriving by a different road.
     *
     * The second clause is written from the *data* rather than from `query.isLoading`, which is
     * `isPending && isFetching` and therefore false in two states that are still "waiting":
     *
     * | state | `isFetching` | `isError` | loading |
     * |---|---|---|---|
     * | the tick after `enabled` flips true, before the fetch starts | false | false | **yes** |
     * | first request in flight | true | false | **yes** |
     * | failed, nothing cached, idle | false | true | no — this is the error state |
     * | retrying after that failure | true | true | **yes**, so the retry button is not a no-op |
     * | any state with grants in hand (incl. a failing refetch) | – | – | no — the screen works |
     */
    const isLoading =
        isBootstrapping || (isAuthenticated && !permission && (query.isFetching || !query.isError))

    const value = useMemo<PermissionValue>(() => {
        return {
            permission,
            isKnown,
            isLoading,
            isError: query.isError,
            can: (capability: Capability) => allows(permission, capability),
            state: (capability: Capability) =>
                capabilityState({
                    permission,
                    capability,
                    isAuthenticated,
                    isLoading,
                    isError: query.isError,
                }),
            /*
             * A shared frozen-in-shape constant rather than a fresh literal, so a consumer memoising on
             * `fiatAgency` does not re-run on every render of this provider while the grants are
             * unknown.
             */
            fiatAgency: permission?.fiatAgency ?? NO_AGENCY,
            grant: (feature: string, flag?: 'allowed' | 'is_active' | 'enabled') =>
                permission ? rawGrant(permission, feature, flag) : false,
            refresh,
        }
        /*
         * `isLoading` is derived **above** the memo rather than inside it, so this value's identity
         * changes only when the boolean flips — not on every `isFetching` toggle. It matters here more
         * than in the other session providers because this one wraps Balance, MyChannel and the whole
         * route tree: a new context object on each background refetch would re-render every consumer to
         * hand them values that did not change.
         */
    }, [permission, isKnown, isLoading, isAuthenticated, query.isError, refresh])

    return <PermissionContext.Provider value={value}>{children}</PermissionContext.Provider>
}

/**
 * What the active account is allowed to do.
 *
 * Throws outside the provider rather than returning a plausible all-denied value: it is mounted above
 * every website route, so being outside it means a component was rendered somewhere it cannot work —
 * and a silent all-denied there would surface much later as "the Payout menu never appears for our
 * agencies" rather than as the real mistake. Same call, same reasoning, as `useBalance` and
 * `useMyChannel`.
 */
export function usePermission(): PermissionValue {
    const value = useContext(PermissionContext)
    if (!value) {
        throw new Error(
            'usePermission must be used inside PermissionProvider (see app/session-providers.tsx)',
        )
    }
    return value
}
