'use client'

import { useAuth } from '@features/auth'
import { useInfiniteQuery } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
    creatorMembershipApi,
    creatorMembershipKeys,
    SUBSCRIBERS_PAGE_SIZE,
} from '../api/membership-api'
import type { Subscriber, SubscriberStatus } from '../api/types'

/**
 * The members list: two paginated tabs, one search box, and the debounce between them.
 *
 * Deliberately the same shape as `features/membership`'s `useMyMemberships`, which solves the
 * identical problem on the other side of the transaction — read that hook's doc for the two
 * decisions repeated here, and their reasons:
 *
 * - **Both statuses are queried on mount.** The design puts the count *in* the tab (*"Active 12"*,
 *   *"Expired 3"*), so both totals have to exist before either tab is opened; an infinite query
 *   fetches only its first page, so the untouched tab costs exactly one request and opening it is
 *   instant. Legacy fires both too.
 * - **The debounce lives here, not in the field.** The term is in the query key, so a key per
 *   keystroke is a request per keystroke *and* a cache entry per prefix. Clearing applies at once,
 *   because the unfiltered list is already cached and 500ms of stale rows reads as a broken button.
 *
 * Legacy debounces at **500ms**; this uses the app's own 400, which is what `/my-membership`'s
 * search already uses — one search feel across the two screens beats matching a number nobody
 * chose deliberately.
 *
 * ## No character floor
 *
 * Legacy has none here either, and it is worth saying why it must not be added: a floor makes the
 * field show the *unfiltered* list until the third character, which reads as broken, and it is
 * wrong for four of the nine locales this app ships — a Korean or Chinese display name is often one
 * or two characters.
 */

/** Matches `/my-membership`'s search. Long enough that a typed word is one request. */
const SEARCH_DEBOUNCE_MS = 400

export interface SubscriberListState {
    rows: Subscriber[]
    /**
     * The server's total for this status — what the tab label prints — or **`null` while unknown**.
     *
     * `null` rather than `0`, because a caller cannot tell those apart and one of them is a decision:
     * the actions menu refuses to let a tier be edited while members are paying for it, and reading
     * an unloaded list as "nobody is paying" opens that gate on a **billing** change. Same rule
     * `features/permission` states for a grant — a gate fails closed, and a failure is not a denial.
     */
    count: number | null
    isLoading: boolean
    isError: boolean
    /** The first page came back and held nothing. */
    isEmpty: boolean
    hasNextPage: boolean
    isFetchingNextPage: boolean
    loadMore: () => void
    refetch: () => void
}

function useSubscriberList({
    status,
    q,
    accountId,
    enabled,
}: {
    status: SubscriberStatus
    q: string
    accountId: string | null
    enabled: boolean
}): SubscriberListState {
    /**
     * Memoised because the key builder returns a **new array** every call, and an unstable key
     * identity is what makes the callbacks below churn. Derived from three primitives, so it changes
     * exactly when one of them does.
     */
    const queryKey = useMemo(
        () => creatorMembershipKeys.subscribers(accountId, status, q),
        [accountId, status, q],
    )

    const query = useInfiniteQuery({
        queryKey,
        initialPageParam: 1,
        queryFn: ({ pageParam, signal }) =>
            creatorMembershipApi.getSubscribers({
                page: pageParam,
                status,
                q,
                accountId,
                signal,
            }),
        /*
         * A short page is the end. Billy pages by number and its `next` cannot be relied on (B38), so
         * the stop condition is inferred — and it reads **`received`**, not `results.length`:
         * `normalizeSubscribers` drops rows it cannot parse, so a full page holding one unreadable
         * row would measure 19 against a page size of 20 and silently hide every page after it. The
         * same trap `useMyMemberships` documents on the same service.
         */
        getNextPageParam: (lastPage, allPages) =>
            lastPage.received < SUBSCRIBERS_PAGE_SIZE ? undefined : allPages.length + 1,
        enabled,
    })

    const rows = useMemo(() => query.data?.pages.flatMap(page => page.results) ?? [], [query.data])

    /*
     * Stable, so the sentinel effect that calls it depends on a function identity that changes only
     * when the guard does. Rebuilt inline it was a new function on every render, and the effect
     * holding it re-ran every render — harmless only because the guard inside made it a no-op, which
     * is a lot of work to do nothing and one refactor away from a fetch loop.
     */
    const { hasNextPage, isFetchingNextPage, fetchNextPage, refetch } = query
    const loadMore = useCallback(() => {
        if (hasNextPage && !isFetchingNextPage) void fetchNextPage()
    }, [hasNextPage, isFetchingNextPage, fetchNextPage])
    const retry = useCallback(() => void refetch(), [refetch])

    return {
        rows,
        // `null`, not `0`, until the first page has actually answered — see the note on the field.
        count: query.data?.pages[0]?.count ?? null,
        isLoading: query.isLoading,
        isError: query.isError,
        isEmpty: !query.isLoading && !query.isError && rows.length === 0,
        hasNextPage,
        isFetchingNextPage,
        loadMore,
        refetch: retry,
    }
}

export interface SubscribersState {
    status: SubscriberStatus
    setStatus: (status: SubscriberStatus) => void
    /** What the field renders — updates on every keystroke. */
    search: string
    setSearch: (value: string) => void
    active: SubscriberListState
    expired: SubscriberListState
    /** The list for the tab that is open. */
    current: SubscriberListState
    /** True once a search term is settled, so an empty list can say *why* it is empty. */
    isFiltered: boolean
    /**
     * How many members are paying **right now, regardless of the search** — or `null` when that is
     * not known. This is the figure that gates a **billing change**, and it is not `active.count`.
     *
     * ⚠ `active.count` is the total for the *current search term*, because the term is in its query
     * key. So typing a name that matches nobody drives it to `0`, and a gate reading
     * `activeCount === 0` unlocks the tier-edit row for a creator with paying members — the exact
     * change `MembershipActionsMenu` documents itself as failing closed against. The search box and
     * the `⋯` menu are on the same screen, so this is two interactions apart.
     *
     * While a search is settled the honest answer is **"not known"**, not the filtered number, and
     * `null` is already what every consumer reads as unknown. That keeps the rule the whole feature
     * states — unknown ⇒ denied, and a *view* of the data is not the data — without a second request
     * to re-derive a total the reader has just narrowed.
     *
     * Exposed from the hook rather than left to the call site precisely because it looked right
     * there: `activeCount={subscribers.active.count}` reads as the obvious thing to pass.
     */
    activeCount: number | null
}

export function useSubscribers({ enabled }: { enabled: boolean }): SubscribersState {
    const { activeId } = useAuth()
    const [status, setStatus] = useState<SubscriberStatus>('active')
    const [search, setSearch] = useState('')
    const [debounced, setDebounced] = useState('')

    useEffect(() => {
        const term = search.trim()
        // Clearing applies at once — see the note above.
        if (!term) {
            setDebounced('')
            return
        }
        const timer = setTimeout(() => setDebounced(term), SEARCH_DEBOUNCE_MS)
        return () => clearTimeout(timer)
    }, [search])

    const active = useSubscriberList({
        status: 'active',
        q: debounced,
        accountId: activeId,
        enabled,
    })
    const expired = useSubscriberList({
        status: 'expired',
        q: debounced,
        accountId: activeId,
        enabled,
    })

    const isFiltered = debounced.length > 0

    return {
        status,
        setStatus,
        search,
        setSearch,
        active,
        expired,
        current: status === 'active' ? active : expired,
        isFiltered,
        // A filtered total is not the answer to "how many members are paying" — see the field.
        activeCount: isFiltered ? null : active.count,
    }
}
