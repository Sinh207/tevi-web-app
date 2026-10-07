'use client'

import { useAuth } from '@features/auth'
import type { PageCursor } from '@shared/lib/api/page-cursor'
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { searchApi, searchKeys } from '../api/search-api'
import type { SearchChannel } from '../api/types'
import { FOLLOWING_GRID_SIZE, nextSearchCursor } from '../lib/search-page'
import { useSearchRecents } from './use-search-recents'

/**
 * `/search`'s whole state: the term, the two lists it drives, and the recents it writes.
 *
 * ## Two queries, not one, and they are not the same *kind* of query
 *
 * The global list is an infinite query and the Following grid is a plain one. That asymmetry is
 * the design rather than an omission — see `searchApi.getFollowedChannels` and
 * `FOLLOWING_GRID_SIZE`: a bounded block of tiles for the spaces you already follow is a shortcut
 * shown whole, and the exhaustive answer is the paginated list underneath it. Legacy runs both off
 * the same term too (`loadInitial` fires the pair), it just holds them in six `useState`s and a
 * `useRef` page counter.
 *
 * They are also allowed to disagree about how they are going. The grid is signed-in-only and its
 * failure is **silent**: a followed list that 502s hides the grid and leaves the global results,
 * which is the part the reader actually asked for. Only the global list's error reaches the screen.
 *
 * ## The debounce is here, and the term is in the query key
 *
 * Same shape as `useBlockedAccounts`, and the same reason: the term is *in the key*, so a key
 * minted per keystroke is a request per keystroke plus a cache entry per prefix. `SearchBar` is a
 * controlled input with no timing of its own; this hook holds the raw value it renders (`search`)
 * and the settled value the keys use (`q`).
 *
 * Legacy debounces at **1000ms**, which is long enough that the screen reads as broken — you type,
 * and for a second nothing at all happens. 400ms is this app's number for a search field
 * (`useBlockedAccounts`, `useMyMemberships`) and is what a typed word costs one request at.
 *
 * **No character floor.** The debounce is the throttle. A floor would silently show *nothing* until
 * the third character, and it is unusable for the CJK locales this app ships, where a space's name
 * is frequently one or two characters — the point `useBlockedAccounts` makes about the same trap.
 *
 * ## Clearing applies at once
 *
 * There is no request to save (the empty term is not queried at all) and 400ms of stale results
 * after pressing the field's cancel reads as the button not working.
 *
 * ## Recents are written on every **settle**, and the prefix problem is solved downstream
 *
 * A term is recorded as soon as the debounce fires — so typing a name, reading the results and
 * leaving records it, which is what a reader expects and what legacy does.
 *
 * This used to be recording on *commit* only (Enter, or opening a result), on the grounds that
 * recording from the debounce is what makes legacy write "a", "ad", "ada", "adam" for one search.
 * That reasoning was right about the defect and wrong about where to fix it: it bought a clean list
 * by dropping the ordinary case, where somebody types a name, looks, and closes the screen — a
 * search that happened and left no trace. The prefix chain is a **storage** question, and
 * `addSearchRecent` now answers it: a term that extends the entry at the top replaces it, so the
 * chain collapses to "adam" wherever the writes came from. Read that function's note for why the
 * rule is scoped to the head and why backspacing deliberately does not collapse.
 *
 * `commit` and `record` stay, and are not redundant. Settling records the term; those two record an
 * **act** on it, which is what re-dates an entry and moves it back to the top — so the ordering
 * tracks what the reader actually used rather than only what they typed.
 *
 * Two functions rather than one, because the two acts are not the same event: `commit` is Enter and
 * records **the field**, `record` is a press on a result and records **`q`**. See each.
 */

/** Long enough that a typed word is one request, short enough to feel like the list follows. */
const SEARCH_DEBOUNCE_MS = 400

export interface UseChannelSearchResult {
    /** What the field shows — updated on every keystroke, unlike the term the requests carry. */
    search: string
    setSearch: (value: string) => void
    /**
     * The settled term. Exposed because the screen's copy needs it: "No results for *X*" has to
     * quote the term that was actually searched, not the one being typed over it.
     */
    query: string
    /**
     * Put a term in the field **and** search it immediately, skipping the debounce — what pressing
     * a recent row does. There is nothing to throttle: the reader chose a whole term in one press.
     */
    submit: (term: string) => void
    /**
     * Settle the field's value now and record it — what pressing **Enter** does. See the note
     * above on why recording is not done from the debounce.
     */
    commit: () => void
    /**
     * Record the term that produced what is on screen — what **opening a result** does.
     *
     * Deliberately not `commit`. Two differences, and each is a small bug the other way round:
     * it remembers `q` rather than the field, because the row being pressed came from `q` and on a
     * fast typist the field has moved on; and it settles nothing, because `commit` here would fire
     * a request for a term whose results the reader is in the act of leaving.
     */
    record: () => void

    /** Spaces this account follows that match the term — the grid. Empty for an anonymous visitor. */
    following: SearchChannel[]
    /**
     * The **Following grid alone** is on its first fetch.
     *
     * Separate from `isLoading`, which is gated on something having been typed. It exists for
     * `followingWhenIdle` callers: with nothing in the field their whole body is the grid, so its
     * pending state is the screen's, and reading `isLoading` there would report `false` while the
     * one request in flight is the one they are waiting for.
     */
    isFollowingLoading: boolean
    /** Every loaded result row, flattened — the page structure never reaches the component. */
    results: SearchChannel[]
    /** The server's total for the global list, not the number loaded. `0` until page one lands. */
    total: number

    /** Nothing has been typed: the screen shows Recents rather than results. */
    isIdle: boolean
    /** The first page of *either* list is in flight. */
    isLoading: boolean
    /** The **global** list failed. A failed Following grid is silent — see the note above. */
    isError: boolean
    /** Both lists came back and both were empty. */
    isEmpty: boolean
    retry: () => void

    hasNextPage: boolean
    isFetchingNextPage: boolean
    loadMore: () => void
}

export interface UseChannelSearchOptions {
    /**
     * Fetch the Following list **before anything is typed**, so an empty field still has something
     * under it.
     *
     * Off for `/search`, whose idle state is the Recents list — a page reached by pressing a search
     * glyph opens on what you searched before, and a block of faces above that would compete with
     * it. On for `CreatorPickerView`, where the reader was not asking to search at all: they
     * pressed *Gift Star* and are being asked **who**, so the spaces they follow are the answer
     * most of them want and a recent *term* is no answer at all.
     *
     * Legacy's Gift Star sheet does the same thing by hand — `getFollowingChannel('')` in an effect
     * on open, and again every time the field goes back to empty. Here it is the query's `enabled`,
     * so the empty-term list is cached like every other term instead of refetched on each clear.
     *
     * It changes **only** what is fetched. `isIdle` still means "nothing typed", and the global
     * results are never requested for an empty term — that endpoint would answer with the whole
     * platform.
     */
    followingWhenIdle?: boolean
    /**
     * How many followed spaces to ask for. `/search` shows ten (`SEARCH_FOLLOWING_SIZE`); the
     * creator picker keeps the strip's twenty, which is the default.
     */
    followingPageSize?: number
    /**
     * Drop sensitive spaces from both lists — `/search` sets it when the account has not turned
     * on *Show NSFW spaces when searching* (`nsfw_settings.nsfw_search`).
     *
     * Applied **here** rather than in the view because `isEmpty` has to be computed over what is
     * actually drawn: a term whose only matches are sensitive must reach the no-results state, not
     * a blank panel.
     *
     * Only as good as the flag on the row. `followed-channels/` sends `is_nsfw`; `search/` does not
     * today, so global results rely on the search service filtering by the account's own setting
     * (B78). Rows without the field parse as `false` and are kept.
     */
    hideNsfw?: boolean
}

export function useChannelSearch({
    followingWhenIdle = false,
    followingPageSize = FOLLOWING_GRID_SIZE,
    hideNsfw = false,
}: UseChannelSearchOptions = {}): UseChannelSearchResult {
    const { activeId, isAuthenticated } = useAuth()
    const { remember } = useSearchRecents()

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
        const timer = setTimeout(() => setQ(next), SEARCH_DEBOUNCE_MS)
        return () => clearTimeout(timer)
    }, [search])

    const isIdle = q === ''

    /*
     * The settle write. `q` is already trimmed and non-empty here, and the effect runs once per
     * settled term rather than per keystroke — the debounce above is what makes that true, so there
     * is no second timer to keep in step.
     *
     * `remember` is stable per account (`useCallback` on `activeId`), so this does not re-fire on
     * every render; and an account switch re-records the current term under the incoming account,
     * which is correct — the list is per-account and that account has now searched it.
     */
    useEffect(() => {
        if (q !== '') remember(q)
    }, [q, remember])

    /*
     * Memoised for the reason `useBlockedAccounts` memoises its own: `searchKeys.*` builds a new
     * array on every call, so an un-memoised key would give every `useCallback` below it a new
     * identity on each render. Derived from primitives, so they change only when the account or
     * the settled term does.
     */
    const resultsKey = useMemo(() => searchKeys.channels(q, activeId), [q, activeId])
    const followingKey = useMemo(
        () => searchKeys.following(q, activeId, followingPageSize),
        [q, activeId, followingPageSize],
    )

    const resultsQuery = useInfiniteQuery({
        queryKey: resultsKey,
        initialPageParam: null as PageCursor | null,
        queryFn: ({ pageParam, signal }) =>
            searchApi.searchChannels({ cursor: pageParam, q, accountId: activeId, signal }),
        getNextPageParam: (last, _pages, lastParam) => nextSearchCursor(last, lastParam),
        enabled: !isIdle,
    })

    const followingQuery = useQuery({
        queryKey: followingKey,
        queryFn: ({ signal }) =>
            searchApi.getFollowedChannels({
                q,
                pageSize: followingPageSize,
                accountId: activeId,
                signal,
            }),
        /*
         * Signed-in only, and the gate is the *query's* rather than a branch in the component:
         * legacy checks `isAuthenticated` inside the fetcher and returns early, which still mints
         * a query that resolves to nothing and still shows a loading state for it. `enabled`
         * leaves it un-fetched, so `isPending` never becomes part of this screen's loading state
         * for a visitor who has no follows to search.
         *
         * `followingWhenIdle` is the one thing that lifts the `!isIdle` half — see the option.
         */
        enabled: (!isIdle || followingWhenIdle) && isAuthenticated,
    })

    /**
     * Put a whole term in at once — a recent row, or anything else that hands over a finished
     * string.
     *
     * Both pieces of state are set, and that is deliberate: setting only `search` would leave the
     * request 400ms behind a press that carried no typing at all. Recorded as well, because
     * pressing a recent *is* a commit — it moves that term back to the top of the list, which is
     * what makes the ordering track use rather than first use.
     */
    const submit = useCallback(
        (term: string) => {
            const trimmed = term.trim()
            setSearch(term)
            setQ(trimmed)
            if (trimmed !== '') remember(trimmed)
        },
        [remember],
    )

    /**
     * Enter: record what is in the field now, and search it.
     *
     * Reads `search` rather than `q` on purpose — Enter is a commit of what the reader *typed*, and
     * on a fast typist the debounce may not have fired yet, so `q` would be a prefix. Settling here
     * as well means Enter searches at once instead of waiting out the timer.
     */
    const commit = useCallback(() => {
        const trimmed = search.trim()
        if (trimmed === '') return
        setQ(trimmed)
        remember(trimmed)
    }, [remember, search])

    /**
     * A press on a result: record the term that **found** it, and change nothing else.
     *
     * `q`, not `search`. The rows on screen were fetched for `q`; if the reader has since typed two
     * more characters, the term worth remembering is still the one whose results they pressed. And
     * no `setQ`, because a search issued as the reader navigates away is a request nobody will read.
     */
    const record = useCallback(() => {
        if (q !== '') remember(q)
    }, [q, remember])

    /**
     * Every loaded row, flattened and **de-duplicated by slug**.
     *
     * The dedupe is not defensive tidiness: this endpoint pages by *offset*
     * (`?page=&page_size=`), so the window moves over a result set the server is free to re-rank
     * between requests. A space that shifts from position 20 to 21 while page two is in flight is
     * returned on both pages — and the row's React key is its slug, so the second copy is a
     * duplicate-key warning in development and, in production, two identical rows in a list whose
     * whole job is to be scanned.
     *
     * Keyed on slug rather than `id` because slug is the one field `normalizeSearchChannels`
     * guarantees (the row is a link to `/@{slug}`, so a row without one was already dropped),
     * while `id` catches to `''`. First occurrence wins, so the server's own ordering survives.
     */
    const results: SearchChannel[] = []
    const seen = new Set<string>()
    for (const page of resultsQuery.data?.pages ?? []) {
        for (const row of page.results) {
            if (seen.has(row.slug) || (hideNsfw && row.is_nsfw)) continue
            seen.add(row.slug)
            results.push(row)
        }
    }

    const followingData = followingQuery.data
    const following = useMemo(
        () =>
            hideNsfw ? (followingData ?? []).filter(row => !row.is_nsfw) : (followingData ?? []),
        [followingData, hideNsfw],
    )

    /**
     * `fetchNextPage` guarded here rather than at the sentinel, and depending on the **three
     * values** rather than on `query`.
     *
     * The object `useInfiniteQuery` returns is new on every render, so depending on it makes
     * `loadMore` a new function every render — and the caller's `useEffect(…, [inView, loadMore])`
     * then re-runs on every render, firing for the whole time the sentinel is on screen.
     * `fetchNextPage` is stable; the two booleans are what should change the identity. The same
     * trap, and the same fix, as `useBlockedAccounts`.
     */
    const { fetchNextPage, hasNextPage, isFetchingNextPage } = resultsQuery
    const loadMore = useCallback(() => {
        if (!hasNextPage || isFetchingNextPage) return
        fetchNextPage()
    }, [fetchNextPage, hasNextPage, isFetchingNextPage])

    /*
     * The grid's `isLoading` counts, and only because it is *above* the results: a block of tiles
     * that pops in after the list has rendered pushes every row down the screen under the reader's
     * eye — further now that it can be several rows tall rather than one. Waiting for both is the
     * smaller cost. It is `false` whenever the query is disabled (anonymous, or nothing typed), so
     * this does not hold the screen for a visitor who will never get a grid.
     */
    const isLoading = resultsQuery.isLoading || followingQuery.isLoading

    return {
        search,
        setSearch,
        query: q,
        submit,
        commit,
        record,

        following,
        isFollowingLoading: followingQuery.isLoading,
        results,
        total: resultsQuery.data?.pages[0]?.count ?? 0,

        isIdle,
        isLoading: !isIdle && isLoading,
        /*
         * The global list only. A followed-channels failure is not this screen's error state —
         * see the note at the top — so `followingQuery.isError` is deliberately not read: the
         * grid simply has nothing in it, which is also what "you follow nobody matching that"
         * looks like, and the difference is not one the reader can act on.
         */
        isError: !isIdle && resultsQuery.isError,
        isEmpty:
            !isIdle &&
            !isLoading &&
            !resultsQuery.isError &&
            results.length === 0 &&
            following.length === 0,
        retry: () => {
            resultsQuery.refetch()
            // Refetched together, so a retry after an outage does not leave the grid empty
            // beside a list that has just come back.
            if (isAuthenticated) followingQuery.refetch()
        },

        hasNextPage,
        isFetchingNextPage,
        loadMore,
    }
}
