'use client'

import { useAuth } from '@features/auth'
import { useTranslation } from '@shared/i18n/use-translation'
import { blocksApi } from '@shared/lib/api/blocks-api'
import type { PageCursor } from '@shared/lib/api/page-cursor'
import {
    type InfiniteData,
    useInfiniteQuery,
    useMutation,
    useQueryClient,
} from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { channelApi, channelKeys } from '../api/channel-api'
import { type BlockedAccount, listUserName } from '../api/types'
import {
    type BlockedAccountsPage,
    nextBlockedCursor,
    removeBlockedAccount,
} from '../lib/blocked-accounts-page'

/**
 * The blocked-accounts screen's whole state: the paginated list, the unblock, the undo, and
 * the exit choreography that sits between the last two.
 *
 * ## Why the animation is in the hook and not the component
 *
 * Because it is not an animation — it is a two-phase removal, and the second phase is a
 * *cache* write. The row has to stay mounted long enough to play its exit, then be dropped
 * from `InfiniteData`; a component that owned only the CSS would have to reach back into the
 * query cache to finish the job, and a component that owned both would lose the timers the
 * moment the list re-renders under it. Keeping `exitingIds` beside the `setQueryData` that
 * consumes it means there is exactly one place where a row can be half-removed.
 *
 * ## Timers, not `animationend`
 *
 * The removal is scheduled on a timer of the same length as the keyframe, and no listener is
 * attached. `animationend` looks tidier and is a trap: it does not fire if the element is
 * unmounted mid-animation (a refetch reorders the list), it does not fire under
 * `prefers-reduced-motion: reduce` where the utility sets `animate-none`, and it fires
 * *twice* if any descendant animation bubbles. Each of those leaves a row that is invisible,
 * un-interactive and permanently in the cache. A timer has one failure mode — it fires — and
 * `EXIT_MS` is the single number the CSS and the timer must agree on.
 *
 * ## Unblock is not optimistic. Undo is not either.
 *
 * `useChannelActions` explains the rule for the channel page: unblocking flips a page out of
 * a terminal state, and an optimistic version rebuilds the wall in the reader's face when the
 * request fails. The same holds one level up — a row that vanishes and comes back is worse
 * than a button that spins for 300ms. So the row leaves *after* the server agrees, and the
 * undo re-blocks and refetches rather than putting the old row back: a new block is a new
 * record with a new id and its own position in the server's order, and re-inserting the old
 * one would show a row whose Unblock button no longer refers to anything.
 *
 * ## The search is the server's, and the debounce is here
 *
 * `q` goes on the request (B76) rather than filtering `entries` in the browser, because the
 * list is paginated: a client-side filter can only search the pages that happen to be loaded,
 * so a name on page four is missing until the reader scrolls past it — which reads as the
 * field being broken rather than as pagination.
 *
 * The debounce is in the hook and not in the field for the reason `useMyMemberships` states:
 * the term is **in the query key**, so a key minted per keystroke is a request per keystroke
 * plus a cache entry per prefix. `SearchBar` is a controlled input with no timing of its own;
 * this hook holds the raw value it renders and the settled value the key uses. No character
 * floor — the debounce is the throttle, and a floor would silently show the *unfiltered* list
 * until the third character (and is unusable for the CJK locales this app ships, where a
 * display name is frequently one or two characters).
 */

/**
 * The exit animation's length, in milliseconds. **Must match `tevi-row-collapse`'s duration
 * in `globals.css`** — the CSS plays it and this schedules the cache write behind it.
 */
const EXIT_MS = 320

/** Long enough that a typed word is one request, short enough to feel like the list follows. */
const SEARCH_DEBOUNCE_MS = 400

export interface UseBlockedAccountsResult {
    /** Every loaded row, flattened — the page structure never reaches the component. */
    entries: BlockedAccount[]
    /** The server's total, not the number loaded. `0` until the first page lands. */
    total: number
    /** What the field shows — updated on every keystroke, unlike the term the request carries. */
    search: string
    setSearch: (value: string) => void
    /**
     * Whether the field is worth rendering at all.
     *
     * The hook decides it because the hook is what knows which state the screen is in: a
     * search box above a sign-in prompt, above "you have blocked nobody", or above a list
     * that failed to load with nothing typed is a control with nothing to act on. It stays
     * `true` through the *initial* load (the field is part of the layout the skeleton stands
     * in for) and through a search that matched nothing — which is the state that most needs
     * it, since clearing the field is the way out.
     */
    canSearch: boolean
    isLoading: boolean
    isError: boolean
    /**
     * `true` only once the first page came back **and** held nothing **and** nothing was
     * typed. A search that matched nothing is `isSearchEmpty`: they read differently and
     * offering "you have not blocked anyone yet" over a filtered list is simply wrong.
     */
    isEmpty: boolean
    /** Nothing matched the search term. */
    isSearchEmpty: boolean
    /** The list needs a real account; an anonymous session has no blocks to show. */
    isSignedOut: boolean
    refetch: () => void
    hasNextPage: boolean
    isFetchingNextPage: boolean
    loadMore: () => void
    /** The row whose unblock is in flight, so its button can spin. */
    unblockingId: string | null
    /**
     * Whether *any* unblock is in flight. The list is single-flight (see `unblock`), so every
     * other row's button has to be disabled while this is true — otherwise pressing one does
     * nothing and says nothing.
     */
    isUnblocking: boolean
    /** Rows playing their exit. Still mounted, already gone as far as the reader is concerned. */
    exitingIds: ReadonlySet<string>
    unblock: (entry: BlockedAccount) => void
}

export function useBlockedAccounts(): UseBlockedAccountsResult {
    const { activeId, isAuthenticated } = useAuth()
    const queryClient = useQueryClient()
    const { t } = useTranslation()

    /** What the field renders. */
    const [search, setSearch] = useState('')
    /** The settled term — what the query key and the request carry. */
    const [q, setQ] = useState('')

    /*
     * Clearing applies **at once**: there is no request to save (the unfiltered list is
     * already in the cache under its own key), and 400ms of stale filtered rows after
     * pressing cancel reads as the button not working.
     */
    useEffect(() => {
        const next = search.trim()
        if (next === '') {
            setQ('')
            return
        }
        const timer = setTimeout(() => setQ(next), SEARCH_DEBOUNCE_MS)
        return () => clearTimeout(timer)
    }, [search])

    /**
     * Memoised, and it is not a micro-optimisation: `channelKeys.blocks` builds a **new array**
     * every call, so an un-memoised key would give `finalizeExit` a new identity on every
     * render — and the effect below, which has to run its cleanup exactly once per account, is
     * keyed on that identity. Derived from primitives, so it changes only when the account or
     * the settled term does.
     */
    const queryKey = useMemo(() => channelKeys.blocks(activeId, q), [activeId, q])

    const query = useInfiniteQuery({
        queryKey,
        initialPageParam: null as PageCursor | null,
        queryFn: ({ pageParam, signal }) =>
            channelApi.getBlockedAccounts({ cursor: pageParam, q, accountId: activeId, signal }),
        getNextPageParam: (last, _pages, lastParam) => nextBlockedCursor(last, lastParam),
        enabled: isAuthenticated,
    })

    const [exitingIds, setExitingIds] = useState<ReadonlySet<string>>(() => new Set())

    /** One timer per exiting row, so a second unblock 100ms into the first's exit does not
     *  cancel it. Flushed rather than cancelled — see the effect below. */
    const exitTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>())

    const finalizeExit = useCallback(
        (id: string) => {
            exitTimers.current.delete(id)
            queryClient.setQueryData<InfiniteData<BlockedAccountsPage, PageCursor | null>>(
                queryKey,
                data => removeBlockedAccount(data, id),
            )
            /*
             * The surgery above is for the list on screen; this is for the *other* search
             * terms' lists, which still hold the row. `refetchType: 'none'` is what keeps it
             * from undoing the removal it just made: it marks the entries stale so each is
             * refetched the next time it is mounted, rather than refetching the mounted one
             * now and replacing the surgically-corrected pages with the server's — which,
             * mid-exit, would put the row back for a frame.
             *
             * Cheaper than the alternative of walking every cached term and editing it: the
             * only entry a reader can see is the one they are looking at, and it is already
             * exact.
             */
            queryClient.invalidateQueries({
                queryKey: channelKeys.blocksAll(activeId),
                refetchType: 'none',
            })
            setExitingIds(previous => {
                if (!previous.has(id)) return previous
                const next = new Set(previous)
                next.delete(id)
                return next
            })
        },
        [activeId, queryClient, queryKey],
    )

    /**
     * Leaving mid-animation **finishes** the removal rather than cancelling it.
     *
     * The row is already unblocked on the server by the time its timer is running — the exit is
     * the last 320ms of an operation that has succeeded, not part of it. So navigating away (or
     * switching accounts) inside that window has to write the removal into the cache anyway.
     * Simply clearing the timers, which is the reflex, leaves the row in a cache with a 60s
     * `staleTime`: come back within the minute and it is still listed, and its Unblock button
     * now 404s.
     *
     * `setQueryData` is safe after unmount — it is a cache write, not a React state update — and
     * the `setExitingIds` inside `finalizeExit` is a no-op on an unmounted component under React
     * 18+, warning included. The cleanup depends on `finalizeExit`, which is stable per account
     * **and per search term**, so it runs at exactly three moments: unmount, an account switch,
     * and a settled search change. In all three the key it flushes into is the *departing* one —
     * which is the correct one, since that is the list the row was in.
     */
    useEffect(() => {
        const timers = exitTimers.current
        return () => {
            // Snapshot first: `finalizeExit` deletes from this very Map. Mutating a Map while a
            // `for…of` walks it is defined behaviour, but "defined" is not the same as obvious,
            // and the loop below is the one place where getting it wrong strands a row.
            const pending = [...timers.entries()]
            timers.clear()
            for (const [id, timer] of pending) {
                clearTimeout(timer)
                finalizeExit(id)
            }
        }
    }, [finalizeExit])

    /**
     * Put the account back.
     *
     * A separate mutation rather than a branch of the first, because it is a different
     * request against a different endpoint with a different failure story: an unblock that
     * fails leaves the row where it was, while an undo that fails means the person is *not*
     * blocked and the toast that promised otherwise has already gone. Hence its own error
     * toast, which is the only thing that can still say so.
     */
    const reblockMutation = useMutation({
        mutationFn: (entry: BlockedAccount) => blocksApi.blockUser(entry.user.id),
        onSuccess: (_data, entry) => {
            // Refetch rather than re-insert: the new block is a new record with a new id, and
            // the server decides where it sits in the order. Every term's list, not just the
            // one on screen — the account is back in all of them that match it.
            queryClient.invalidateQueries({ queryKey: channelKeys.blocksAll(activeId) })
            if (entry.user.slug) {
                queryClient.invalidateQueries({
                    queryKey: channelKeys.detail(entry.user.slug, activeId),
                })
            }
        },
        meta: { showErrorToast: t('blocked_accounts_error_undo') },
    })

    const unblockMutation = useMutation({
        mutationFn: (entry: BlockedAccount) => blocksApi.unblockUser(entry.id),
        onSuccess: (_data, entry) => {
            setExitingIds(previous => new Set(previous).add(entry.id))
            exitTimers.current.set(
                entry.id,
                setTimeout(() => finalizeExit(entry.id), EXIT_MS),
            )

            /*
             * That person's channel page is now reachable again, so its cached `blocking_channel`
             * is stale. Only *their* entry is dropped — a slug-wide prefix would also invalidate
             * every other account's cached view of the same channel, and this changes what one
             * account can see. A row whose payload carried no slug simply skips it: there is no
             * key to invalidate, and the page fetches on its own when it is next opened.
             */
            if (entry.user.slug) {
                queryClient.invalidateQueries({
                    queryKey: channelKeys.detail(entry.user.slug, activeId),
                })
            }

            const name = listUserName(entry.user) || entry.user.slug
            toast.success(
                name
                    ? t('blocked_accounts_unblocked', { name })
                    : t('blocked_accounts_unblocked_generic'),
                {
                    /*
                     * One id for the whole screen, as `copy-hex-button.tsx` does: unblocking three
                     * rows in a row replaces the toast instead of stacking three, and the Undo that
                     * is on screen is always the last action's — which is the only one anybody
                     * means by "undo".
                     */
                    id: 'blocked-accounts-undo',
                    action: {
                        label: t('blocked_accounts_undo'),
                        onClick: () => reblockMutation.mutate(entry),
                    },
                },
            )
        },
        meta: { showErrorToast: t('blocked_accounts_error_unblock') },
    })

    /**
     * **One unblock at a time, for the whole list.**
     *
     * Not a limitation of `useMutation` so much as of what a *single* mutation can report:
     * `isPending` and `variables` describe the most recent run, so two overlapping unblocks
     * would leave `unblockingId` pointing at one of them and the other row spinning forever.
     * Legacy is single-flight too (`unblockingUserId`).
     *
     * The consequence is the thing that has to be handled, not the rule: a press on *another*
     * row while one is in flight would otherwise be swallowed with no feedback at all. So the
     * hook publishes `isUnblocking` and the view disables every other row's button for the
     * ~300ms it lasts — a control that cannot act must not look like one.
     */
    const unblock = useCallback(
        (entry: BlockedAccount) => {
            // Still guarded here as well as in the view: `disabled` is a rendered attribute and
            // a second tap can land in the same frame as the first, before it exists.
            if (unblockMutation.isPending || exitingIds.has(entry.id)) return
            unblockMutation.mutate(entry)
        },
        [exitingIds, unblockMutation],
    )

    const entries = query.data?.pages.flatMap(page => page.results) ?? []

    /**
     * `fetchNextPage` guarded here rather than at the sentinel.
     *
     * `useInView` fires on every intersection change, and a sentinel 600px below the fold is
     * intersecting for the whole time a page is loading — so an unguarded call site requests
     * the same page several times. TanStack Query dedupes concurrent fetches for one key, but
     * the guard is what keeps that from being the thing holding it together.
     *
     * ⚠ **The dependencies are the three values, not `query`.** The object `useInfiniteQuery`
     * returns is new on every render, so depending on it makes `loadMore` a new function every
     * render — and the caller's `useEffect(…, [inView, loadMore])` then re-runs on *every*
     * render, firing `loadMore()` for the whole time the sentinel is on screen. The guard above
     * turns that into a no-op rather than a request storm, which is exactly the "the guard is
     * the thing holding it together" state this comment says it is not. `fetchNextPage` is
     * stable across renders; the two booleans are what should change the identity.
     */
    const { fetchNextPage, hasNextPage, isFetchingNextPage } = query
    const loadMore = useCallback(() => {
        if (!hasNextPage || isFetchingNextPage) return
        fetchNextPage()
    }, [fetchNextPage, hasNextPage, isFetchingNextPage])

    const settledEmpty = !query.isLoading && !query.isError && entries.length === 0

    return {
        entries,
        total: query.data?.pages[0]?.count ?? 0,
        search,
        setSearch,
        /*
         * Three terminal states hide the field, and each is a control with nothing to act on:
         * no account, nothing blocked at all, or a first load that failed with nothing typed.
         * The error case is qualified by `search` rather than by `q`, so a failed *search*
         * keeps the field — otherwise the request that failed is also the one the reader
         * cannot undo.
         */
        canSearch:
            isAuthenticated &&
            !(settledEmpty && q === '') &&
            !(query.isError && search.trim() === ''),
        isLoading: query.isLoading,
        isError: query.isError,
        isEmpty: settledEmpty && q === '',
        isSearchEmpty: settledEmpty && q !== '',
        isSignedOut: !isAuthenticated,
        refetch: () => {
            query.refetch()
        },
        hasNextPage,
        isFetchingNextPage,
        loadMore,
        unblockingId: unblockMutation.isPending ? (unblockMutation.variables?.id ?? null) : null,
        isUnblocking: unblockMutation.isPending,
        exitingIds,
        unblock,
    }
}
