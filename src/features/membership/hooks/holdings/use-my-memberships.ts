'use client'

import { useAuth } from '@features/auth'
import { useInfiniteQuery } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { MEMBERSHIP_PAGE_SIZE, membershipApi, membershipKeys } from '../../api/subscription-api'
import type { Membership, MembershipStatus } from '../../api/types'
import { isPaymentMethodFilter, type PaymentMethodFilter } from '../../lib/payment-methods'
import { useMembershipPaymentSync } from '../use-membership-payment-sync'

/**
 * `/my-membership`'s whole state: two paginated lists, three filters and the debounce between the
 * search field and the request.
 *
 * ## Both statuses are queried, and that is what makes the tab labels honest
 *
 * The design puts the count *in* the tab — "Active (3)" / "Expired (1)" — so both numbers have to
 * exist before either tab is opened. An infinite query only fetches its first page on mount, so the
 * cost of the tab nobody has pressed is exactly **one** request, and pressing it is then instant
 * rather than a load. Legacy fires both too (`TabStatus`'s effect calls `loadInitialActive()` and
 * `loadInitialExpired()`), so this is not extra traffic — it is the same traffic with the pages
 * cached.
 *
 * Both carry the *same* payment filter and search term, which is why a filtered tab label counts
 * filtered rows. That is deliberate: a reader who has typed a name wants to know it matched nothing
 * in *either* status, not that "Expired (7)" still holds a stale total.
 *
 * ## The debounce is here, not in the field
 *
 * The query key contains `q`, so a key minted per keystroke is a request per keystroke plus a cache
 * entry per prefix. `SearchBar` is a controlled input with no timing of its own; this hook holds the
 * raw value the field renders and the settled value the key uses.
 *
 * **No character floor**, unlike legacy's three. Its purpose there is to throttle, and the debounce
 * already does that; what a floor actually produces is a search box that silently shows the
 * *unfiltered* list until the third character, which reads as broken. It is also wrong for four of
 * the nine locales this app ships — a Korean or Chinese display name is frequently one or two
 * characters, so a three-character floor makes the field unusable for the readers most likely to
 * need it.
 *
 * Clearing applies **at once**: there is no request to save (the unfiltered list is already in the
 * cache under its own key), and 400ms of stale filtered rows after pressing cancel reads as the
 * button not working.
 */

/** Long enough that a typed word is one request, short enough to feel like the list is following. */
const SEARCH_DEBOUNCE_MS = 400

interface MembershipListState {
    entries: Membership[]
    /**
     * What the tab label says — the server's total for this status, **or `0` when the list settled
     * empty**. See the note on `count` below for why those can disagree.
     */
    count: number
    isLoading: boolean
    isError: boolean
    /** The first page came back and held nothing. Which *kind* of empty is decided below. */
    settledEmpty: boolean
    /**
     * The server sent rows and **none of them could be rendered**. Not an empty list — a failure to
     * read one, and the view says so instead of blaming the reader's filter.
     */
    isUnreadable: boolean
    hasNextPage: boolean
    isFetchingNextPage: boolean
    loadMore: () => void
    refetch: () => void
}

/**
 * One status's paginated list.
 *
 * Called twice, in a fixed order, which is what makes two `useInfiniteQuery`s legal here — the
 * alternative (a loop over the statuses) would not be.
 */
function useMembershipList({
    status,
    paymentMethod,
    q,
    accountId,
    enabled,
}: {
    status: MembershipStatus
    paymentMethod: PaymentMethodFilter
    q: string
    accountId: string | null
    enabled: boolean
}): MembershipListState {
    /**
     * Memoised because `membershipKeys.list` builds a **new array** every call, and an unstable key
     * identity is what makes the callbacks below churn. Derived from four primitives, so it changes
     * exactly when one of them does.
     */
    const queryKey = useMemo(
        () => membershipKeys.list(accountId, status, paymentMethod, q),
        [accountId, status, paymentMethod, q],
    )

    const query = useInfiniteQuery({
        queryKey,
        initialPageParam: 1,
        queryFn: ({ pageParam, signal }) =>
            membershipApi.getMyMemberships({
                page: pageParam,
                status,
                paymentMethod,
                q,
                accountId,
                signal,
            }),
        /*
         * A short page is the end — billy pages by number and carries no `next` (B38), so "is there
         * more" has to be inferred, exactly as the two ledgers do.
         *
         * **`received`, not `results.length`.** `normalizeMemberships` drops rows it cannot render,
         * so a full page containing one unparseable row would measure 19 against a page size of 20
         * and stop the list there — silently hiding every page after it. `received` is what the
         * server actually sent.
         *
         * `lastPageParam + 1` rather than `pages.length + 1`: the same number today, and not the
         * same the moment a page is dropped or the list is seeded.
         */
        getNextPageParam: (lastPage, _pages, lastPageParam) =>
            lastPage.received === MEMBERSHIP_PAGE_SIZE ? lastPageParam + 1 : undefined,
        enabled,
    })

    const entries = useMemo(
        () => query.data?.pages.flatMap(page => page.results) ?? [],
        [query.data],
    )

    const pages = query.data?.pages ?? []
    const settledEmpty = !query.isLoading && !query.isError && entries.length === 0

    /**
     * The number the tab label prints.
     *
     * The newest page's total — every page carries it and the later one is the fresher answer — **but
     * zero once the list has settled empty**, and that clamp is the fix for a real defect: the tab read
     * `Expired (15)` over an empty panel, because `count` is the server's and the rows had all been
     * dropped by the parser (see `normalizeMemberships`). The parser bug is fixed; this is the guard
     * that stops the *class* of bug from looking like an empty list again.
     *
     * It also covers the case that is not ours: `count` is computed by the backend and there is no
     * guarantee it respects `payment_method` or `q` the way `results` does (**B61**). If it does not, a
     * filtered tab would print an unfiltered total over a filtered list — a number that contradicts
     * what is on screen either way. Whatever the cause, the label agrees with the panel.
     */
    const count = settledEmpty ? 0 : (pages.at(-1)?.count ?? 0)

    /**
     * `fetchNextPage` guarded here rather than at the sentinel: `useInView` fires on every
     * intersection change, and a sentinel 600px below the fold is intersecting for the whole time a
     * page is loading — so an unguarded call site requests the same page several times. TanStack
     * dedupes concurrent fetches for one key, but the guard is what keeps that from being the thing
     * holding it together.
     *
     * ⚠ **The dependencies are the three values, not `query`.** The object `useInfiniteQuery` returns
     * is new on every render, so depending on it makes `loadMore` a new function every render — and
     * the view's `useEffect(…, [sentinelInView, loadMore])` then re-runs on *every* render, calling
     * `loadMore()` for the whole time the sentinel is on screen. `fetchNextPage` is stable across
     * renders; the two booleans are what should change the identity. Same trap, same fix, as
     * `useBlockedAccounts`, which has the longer version of this note.
     */
    const { fetchNextPage, hasNextPage, isFetchingNextPage, refetch } = query
    const loadMore = useCallback(() => {
        if (!hasNextPage || isFetchingNextPage) return
        fetchNextPage()
    }, [fetchNextPage, hasNextPage, isFetchingNextPage])

    return {
        entries,
        count,
        isLoading: query.isLoading,
        isError: query.isError,
        settledEmpty,
        /*
         * `received` is what the **server** put in the page, before `normalizeMemberships` dropped
         * anything — which is exactly what makes this distinguishable from an empty list. It already
         * existed for the pagination check (a short page ends the list); this is the second thing it
         * pays for.
         */
        isUnreadable: settledEmpty && pages.some(page => page.received > 0),
        hasNextPage,
        isFetchingNextPage,
        loadMore,
        // Identity does not matter: it is only ever a button's `onClick`, never an effect's dependency.
        refetch: () => {
            refetch()
        },
    }
}

export interface UseMyMembershipsResult {
    /** Which tab is open. Also the `status` both requests are filtered by. */
    status: MembershipStatus
    setStatus: (status: MembershipStatus) => void
    paymentMethod: PaymentMethodFilter
    setPaymentMethod: (method: string) => void
    /** What the field shows — updated on every keystroke, unlike the value the request carries. */
    search: string
    setSearch: (value: string) => void
    /** The server's totals, for the tab labels. Both reflect the current filters. */
    counts: Record<MembershipStatus, number>
    /** The open tab's rows, flattened — the page structure never reaches the component. */
    entries: Membership[]
    isLoading: boolean
    isError: boolean
    /**
     * The server answered with rows this client could not read a single one of. Rendered as a failure,
     * not as an empty list — see `MembershipListState.isUnreadable`.
     */
    isUnreadable: boolean
    /** Nothing at all, with no filter and no search applied. */
    isEmpty: boolean
    /** Nothing matched the **search**. Takes precedence over the filter's empty state. */
    isSearchEmpty: boolean
    /** Nothing matched the **payment method**, with no search applied. */
    isFilteredEmpty: boolean
    /** The list needs a real account; an anonymous session holds no memberships. */
    isSignedOut: boolean
    hasNextPage: boolean
    isFetchingNextPage: boolean
    loadMore: () => void
    refetch: () => void
    /** Drops the payment filter — the action on the filtered empty state. */
    clearFilters: () => void
}

export function useMyMemberships(): UseMyMembershipsResult {
    const { activeId, isAuthenticated } = useAuth()

    /*
     * The same reason the join surface needs it: a card renewal settles inside `features/payment`,
     * which invalidates the balance and announces on the bus — nothing of ours. Without this the
     * screen still says "Expired" on a row that was just paid for.
     */
    useMembershipPaymentSync()

    const [status, setStatus] = useState<MembershipStatus>('active')
    const [paymentMethod, setPaymentMethodState] = useState<PaymentMethodFilter>('')
    const [search, setSearch] = useState('')
    /** The settled term — what the query key and the request carry. */
    const [query, setQuery] = useState('')

    useEffect(() => {
        const next = search.trim()
        if (next === '') {
            setQuery('')
            return
        }
        const timer = setTimeout(() => setQuery(next), SEARCH_DEBOUNCE_MS)
        return () => clearTimeout(timer)
    }, [search])

    const enabled = isAuthenticated && Boolean(activeId)
    const shared = { paymentMethod, q: query, accountId: activeId, enabled }

    const active = useMembershipList({ ...shared, status: 'active' })
    const expired = useMembershipList({ ...shared, status: 'expired' })
    const open = status === 'active' ? active : expired

    const setPaymentMethod = useCallback((method: string) => {
        // Sanitised against this screen's own vocabulary — an unknown value would become a request
        // that returns nothing and an empty state that blames the reader.
        if (isPaymentMethodFilter(method)) setPaymentMethodState(method)
    }, [])

    const clearFilters = useCallback(() => setPaymentMethodState(''), [])

    return {
        status,
        setStatus,
        paymentMethod,
        setPaymentMethod,
        search,
        setSearch,
        counts: { active: active.count, expired: expired.count },
        entries: open.entries,
        isLoading: open.isLoading,
        isError: open.isError,
        /*
         * The three empty states are split here rather than in the view, because only this hook knows
         * which filters are applied. They say different things — "you have never joined one" versus
         * "nothing matched what you typed" versus "nothing was paid this way" — and offering the
         * first when the third is true sends a reader looking for a lost subscription.
         *
         * Search outranks the filter: it is the more recent thing the reader did, and its state is
         * the one with an obvious next move.
         */
        isUnreadable: open.isUnreadable,
        /*
         * All three exclude `isUnreadable`: a page of rows that could not be parsed is not "you have
         * never joined one" and not "nothing matched your filter", and saying either of those blames
         * the reader for our failure. The view checks the failure first anyway; stating it here too
         * means a future caller cannot get the order wrong.
         */
        isEmpty: open.settledEmpty && !open.isUnreadable && query === '' && paymentMethod === '',
        isSearchEmpty: open.settledEmpty && !open.isUnreadable && query !== '',
        isFilteredEmpty:
            open.settledEmpty && !open.isUnreadable && query === '' && paymentMethod !== '',
        isSignedOut: !isAuthenticated,
        hasNextPage: open.hasNextPage,
        isFetchingNextPage: open.isFetchingNextPage,
        loadMore: open.loadMore,
        refetch: open.refetch,
        clearFilters,
    }
}
