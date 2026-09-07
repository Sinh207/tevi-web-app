'use client'

import { useAuth } from '@features/auth'
import type { PageCursor } from '@shared/lib/api/page-cursor'
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { giftRecipientApi, giftRecipientKeys } from '../api/gift-recipient-api'
import type { GiftRecipient } from '../api/gift-types'
import { nextGiftRecipientCursor } from '../lib/gift-recipient-page'

/**
 * The recipient picker's whole state: the term, and the two lists it drives.
 *
 * ## Two queries, and they are not the same *kind* of query
 *
 * The global list is infinite and the followed list is a plain one — an asymmetry that is the
 * design rather than an omission (see `GIFT_FOLLOWING_SIZE`): a bounded block of people you already
 * follow is a shortcut shown whole, and the exhaustive answer is the paginated list underneath it.
 * Legacy runs both off the same term too; it just holds them in six `useState`s and a `useRef` page
 * counter, and its `handleChangeInput` has four branches that set the same five pieces of state.
 *
 * They are also allowed to disagree about how they are going. The followed list is signed-in-only
 * and **its failure is silent**: a 502 there hides the block and leaves the global results, which
 * is the part the reader asked for. Only the global list's error reaches the screen.
 *
 * ## The debounce is here, and the term is in the query key
 *
 * The term being *in the key* is what makes backspacing to a prefix a cache hit instead of a
 * request, and what makes clearing the field instant. It also means a key minted per keystroke is a
 * request per keystroke, which is what the debounce is for.
 *
 * **400ms**, this app's number for a search field (`useChannelSearch`, `useBlockedAccounts`) and not
 * legacy's **1000**, which is long enough that the screen reads as broken — you type, and for a
 * second nothing at all happens.
 *
 * **No character floor.** The debounce is the throttle. A floor shows nothing until the third
 * character and is unusable for the CJK locales this app ships, where a space's name is frequently
 * one or two characters.
 *
 * Clearing applies **at once**: there is no request to save (the empty term is not queried at all),
 * and 400ms of stale results after pressing the field's cancel reads as the button not working.
 *
 * ## Nothing is remembered
 *
 * Deliberately, and it is the reason this hook exists rather than `features/search`'s: that one
 * writes the reader's global search history on every commit, and a gift recipient's handle landing
 * in it would be one screen writing another feature's memory. Nobody searching for someone to buy a
 * present for is asking to be reminded of it on the search page.
 */

/** Long enough that a typed word is one request, short enough to feel like the list follows. */
const DEBOUNCE_MS = 400

export interface UseGiftRecipientsResult {
    /** What the field shows — updated on every keystroke, unlike the term the requests carry. */
    search: string
    setSearch: (value: string) => void
    /** Settle the field now, skipping the debounce — what pressing **Enter** does. */
    commit: () => void

    /** Spaces this account follows that match the term. Empty for an anonymous visitor. */
    following: GiftRecipient[]
    /** Every loaded result row, flattened — the page structure never reaches the component. */
    results: GiftRecipient[]

    /** Nothing has been typed: the screen shows the invitation rather than a list. */
    isIdle: boolean
    /**
     * The followed list's first answer is in flight — what the strip's **placeholder** is drawn on.
     *
     * It already folds in "can this account have a followed list at all": the query is gated on a
     * real, non-anonymous session, so for a guest this is never true and the loading state reserves
     * no block that can never arrive. That is why there is no separate `canFollow` on this result —
     * a second flag saying the same thing is a second thing a call site can get out of step.
     */
    isFollowingLoading: boolean
    /** The global list's first page is in flight. Drives the rows' placeholder. */
    isResultsLoading: boolean
    /** The **global** list failed. A failed followed list is silent — see the note above. */
    isError: boolean
    /** Both lists came back and both were empty. */
    isEmpty: boolean
    retry: () => void

    hasNextPage: boolean
    isFetchingNextPage: boolean
    loadMore: () => void
}

export function useGiftRecipients(): UseGiftRecipientsResult {
    const { activeId, isAuthenticated, isAnonymous } = useAuth()
    /**
     * Whether asking for a followed list makes any sense.
     *
     * `isAuthenticated` alone is not the question: this app **always keeps a session**, so it is true
     * for a visitor who has never signed in — and an anonymous account follows nobody, so that query
     * is a request per settled term whose answer is known in advance. `/search`'s hook gates on the
     * looser flag; this is the tighter one, and it also gives the skeleton an exact answer instead of
     * a guess — it is folded into `isFollowingLoading`, which is what the picker reads.
     */
    const canFollow = isAuthenticated && !isAnonymous

    /** What the field renders. */
    const [search, setSearch] = useState('')
    /** The settled term — what the query keys and the requests carry. */
    const [q, setQ] = useState('')

    useEffect(() => {
        const next = search.trim()
        if (next === '') {
            setQ('')
            return
        }
        const timer = setTimeout(() => setQ(next), DEBOUNCE_MS)
        return () => clearTimeout(timer)
    }, [search])

    const isIdle = q === ''

    /*
     * Memoised for the reason `useChannelSearch` memoises its own: `giftRecipientKeys.*` builds a
     * new array on every call, so an un-memoised key would give every `useCallback` below it a new
     * identity each render. Derived from primitives, so they move only when the account or the
     * settled term does.
     */
    const resultsKey = useMemo(() => giftRecipientKeys.search(q, activeId), [q, activeId])
    const followingKey = useMemo(() => giftRecipientKeys.following(q, activeId), [q, activeId])

    const resultsQuery = useInfiniteQuery({
        queryKey: resultsKey,
        initialPageParam: null as PageCursor | null,
        queryFn: ({ pageParam, signal }) =>
            giftRecipientApi.searchRecipients({
                cursor: pageParam,
                q,
                accountId: activeId,
                signal,
            }),
        getNextPageParam: (last, _pages, lastParam) => nextGiftRecipientCursor(last, lastParam),
        enabled: !isIdle,
    })

    const followingQuery = useQuery({
        queryKey: followingKey,
        queryFn: ({ signal }) =>
            giftRecipientApi.getFollowedRecipients({ q, accountId: activeId, signal }),
        /*
         * A real account only, and the gate is the *query's* rather than a branch in the component:
         * gating inside the fetcher — which is what legacy does — still mints a query that resolves
         * to nothing and still contributes a pending state, so the screen would show a loading block
         * for a list a visitor can never have.
         */
        enabled: !isIdle && canFollow,
    })

    const following = followingQuery.data ?? []

    /**
     * Every row loaded so far, **de-duplicated by slug**.
     *
     * A numbered `?page=` list over a dataset the backend is free to re-rank can return the same
     * space on two pages — and React is then handed two children with the same key, which is a
     * warning in development and a row that reorders under the reader's finger in production. Only
     * the second occurrence is dropped, so the order the server chose survives.
     *
     * It deliberately does **not** de-duplicate against the Following block above it. A space you
     * follow appearing in both sections is not a duplicate: the two answer different questions
     * ("people you follow, matching this" and "everybody, matching this"), and `/search` shows the
     * same person in both for the same reason.
     */
    const results = useMemo(() => {
        const seen = new Set<string>()
        const rows: GiftRecipient[] = []
        for (const page of resultsQuery.data?.pages ?? []) {
            for (const row of page.results) {
                if (seen.has(row.slug)) continue
                seen.add(row.slug)
                rows.push(row)
            }
        }
        return rows
    }, [resultsQuery.data])

    const commit = useCallback(() => {
        const trimmed = search.trim()
        if (trimmed !== '') setQ(trimmed)
    }, [search])

    /**
     * **Two loading states, not one** — and that is what makes the placeholder match the screen.
     *
     * They were merged, and the panel showed six row-shaped bars until *both* lists had settled. The
     * real success layout is a 167px strip and a section header **above** those rows, so the moment
     * results landed everything below jumped down 215px — measured at 390 and at 1280. A skeleton
     * that does not reserve what replaces it is a layout shift with extra steps, which is the one
     * thing `docs/DEFINITION_OF_DONE.md` §1 asks a skeleton to prevent.
     *
     * Split, each section stands in for its own request: the strip's placeholder is drawn while the
     * followed list is in flight and never otherwise, and the rows' while the global list is. It
     * also means a strip that settles first is **shown** rather than held back behind the slower
     * list — the two requests are independent and there is no reason to make one wait.
     *
     * `isFetching && !isFetchingNextPage` rather than `isPending`, because a term that changes while
     * rows from the previous term are on screen keeps `isPending` false — TanStack has data, just
     * for a different key — and the list would show the *old* results under the new term until the
     * request landed. The next-page fetch is excluded so scrolling does not replace the list with a
     * skeleton.
     */
    const isResultsLoading = !isIdle && resultsQuery.isFetching && !resultsQuery.isFetchingNextPage
    const isFollowingLoading = !isIdle && canFollow && followingQuery.isFetching

    return {
        search,
        setSearch,
        commit,
        following,
        results,
        isIdle,
        isFollowingLoading,
        isResultsLoading,
        isError: resultsQuery.isError,
        /*
         * Settled, and **both** lists held nothing.
         *
         * Guarded on `isSuccess` rather than on `!isLoading`, so the empty state cannot flash
         * between a term changing and its first page arriving — and on `!isFollowingLoading` for the
         * mirror case, which the split above created: with the global list settled empty and the
         * followed one still in flight, `following` is `[]` because it has not answered yet, not
         * because there is nothing. Without that guard the screen drew "no results found" over a
         * strip that was about to arrive.
         */
        isEmpty:
            !isIdle &&
            resultsQuery.isSuccess &&
            !isFollowingLoading &&
            results.length === 0 &&
            following.length === 0,
        retry: () => {
            void resultsQuery.refetch()
            void followingQuery.refetch()
        },
        hasNextPage: resultsQuery.hasNextPage,
        isFetchingNextPage: resultsQuery.isFetchingNextPage,
        loadMore: () => {
            if (resultsQuery.hasNextPage && !resultsQuery.isFetchingNextPage) {
                void resultsQuery.fetchNextPage()
            }
        },
    }
}
