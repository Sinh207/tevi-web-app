'use client'

import { useAuth } from '@features/auth'
import { useTranslation } from '@shared/i18n/use-translation'
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
import { type FollowRequest, listUserName } from '../api/types'
import {
    clearFollowRequests,
    type FollowRequestsPage,
    nextFollowRequestCursor,
    removeFollowRequest,
} from '../lib/follow-requests-page'
import { useMyChannel } from '../providers/my-channel-provider'

/**
 * The follow-requests screen's whole state: the paginated queue, the per-row answer, the two
 * bulk answers, and the exit choreography between a successful answer and the row leaving.
 *
 * Built on `useBlockedAccounts`, which is the same shape of screen — read that hook for why the
 * removal animation lives here rather than in the component, and why it is a timer rather than
 * an `animationend` listener. What follows is only what this screen does *differently*.
 *
 * ## One mutation for both answers, not two
 *
 * Accept and Decline are different requests (a POST to `…/accept/`, a DELETE on the row) but
 * they are the same *interaction*: one row, one press, one row leaves. A mutation per verb
 * would mean two `isPending` flags, two `variables`, and a call site that has to ask both which
 * row is busy — and it would still not stop somebody pressing Accept on one row while a Decline
 * on another is in flight, because neither mutation can see the other. `respond({ entry,
 * action })` makes the answer a *parameter*, so single-flight is the default rather than
 * something the view has to assemble.
 *
 * ## Nothing here is optimistic, and there is no undo
 *
 * The row leaves **after** the server agrees, for the reason `useBlockedAccounts` gives — a row
 * that vanishes and comes back is worse than a button that spins for 300ms. And unlike an
 * unblock, neither answer is undoable by this client: accepting cannot be reversed except by
 * blocking or removing a follower (a different screen), and declining destroys the request —
 * the person has to ask again, which is not something an Undo button can do on their behalf. So
 * the toast states what happened and offers nothing. Offering an Undo that silently does the
 * wrong thing would be worse than not offering one.
 *
 * ## The bulk actions clear the cache, and the rows still get their exit
 *
 * `accept-all` / `decline-all` act on the server's whole queue, which is not the same set as the
 * pages this browser happens to have loaded — so the cache is **emptied outright** and refetched
 * rather than each loaded row being removed one by one. The refetch is what brings back anything
 * that arrived while the bulk request was in flight, and is the only honest way to show a queue
 * whose true size was never on screen.
 *
 * The animation is separate from that, and it is why the emptying is on a timer: every loaded row
 * is marked exiting first, so twenty rows collapse together and the panel closes into its empty
 * state. Answering one row and answering all of them are the same outcome and now look like it —
 * before this, the single row folded away over 320ms and the bulk press made the whole list
 * vanish between two frames, which reads as a glitch rather than as a result.
 *
 * The view puts a confirmation in front of both, because neither is reversible.
 */

/**
 * The exit animation's length, in milliseconds. **Must match `tevi-row-collapse`'s duration in
 * `globals.css`** — the CSS plays it and this schedules the cache write behind it. Same
 * constant, same duty, as in `useBlockedAccounts`.
 */
const EXIT_MS = 320

/** Which answer a press carries. The wire has two verbs; the interaction has one. */
export type FollowRequestAction = 'accept' | 'decline'

export interface UseFollowRequestsResult {
    /** Every loaded row, flattened — the page structure never reaches the component. */
    entries: FollowRequest[]
    /** The server's total, not the number loaded. `0` until the first page lands. */
    total: number
    isLoading: boolean
    isError: boolean
    /** The first page came back and held nothing. */
    isEmpty: boolean
    /** The queue needs a real account; an anonymous session has no space to be asked about. */
    isSignedOut: boolean
    refetch: () => void
    hasNextPage: boolean
    isFetchingNextPage: boolean
    loadMore: () => void
    /** The row whose answer is in flight, so its button can spin. */
    pendingId: string | null
    /** Which of the two buttons on that row was pressed. */
    pendingAction: FollowRequestAction | null
    /**
     * Whether *any* answer is in flight. The list is single-flight, so every other row's
     * buttons have to be disabled while this is true — otherwise pressing one does nothing
     * and says nothing.
     */
    isResponding: boolean
    /** Rows playing their exit. Still mounted, already gone as far as the reader is concerned. */
    exitingIds: ReadonlySet<string>
    respond: (entry: FollowRequest, action: FollowRequestAction) => void
    /** A bulk answer is in flight — the action bar spins and the confirm dialog holds. */
    isBulkPending: boolean
    /** Which bulk answer, so the bar can spin the button that was pressed. */
    bulkAction: FollowRequestAction | null
    respondAll: (action: FollowRequestAction) => void
}

export function useFollowRequests(): UseFollowRequestsResult {
    const { activeId, isAuthenticated } = useAuth()
    const { myChannel } = useMyChannel()
    const queryClient = useQueryClient()
    const { t } = useTranslation()

    /**
     * Memoised, and it is not a micro-optimisation: `channelKeys.followRequests` builds a **new
     * array** every call, so an un-memoised key would give `finalizeExit` a new identity on
     * every render — and the effect below, which must run its cleanup exactly once per account,
     * is keyed on that identity.
     */
    const queryKey = useMemo(() => channelKeys.followRequests(activeId), [activeId])

    const query = useInfiniteQuery({
        queryKey,
        initialPageParam: null as PageCursor | null,
        queryFn: ({ pageParam, signal }) =>
            channelApi.getFollowRequests({ cursor: pageParam, accountId: activeId, signal }),
        getNextPageParam: (last, _pages, lastParam) => nextFollowRequestCursor(last, lastParam),
        enabled: isAuthenticated,
    })

    /**
     * What an answered request changes besides this list.
     *
     * The badge, always — it is the same number this screen just made smaller, and it is on
     * every page in the drawer. The space's own payload and its stats only on **accept**: a
     * decline adds no follower, so refetching a follower count that cannot have moved is a
     * request to be told the same thing.
     *
     * ⚠ **`refetchType: 'none'` on those two**, which is the difference between answering ten
     * requests costing ten refetches and costing none. Neither figure is on *this* screen — the
     * follower count lives on the space's page and in its stats card — so a refetch now is a
     * request whose answer nothing renders. Marking them stale instead means whichever screen
     * reads them next fetches once, with everything already answered. Same call, same reasoning,
     * as `useBlockedAccounts`'s `blocksAll` invalidation.
     *
     * The badge is *not* given that treatment: it is a mounted, visible query whenever the drawer
     * is open, and a stale-but-not-refetched count is a wrong number on screen. When the drawer
     * is closed its query is disabled, so the invalidation costs nothing there either.
     *
     * `stats` is keyed by slug, so it can only be invalidated when the account has a space this
     * client knows the slug of. It normally does — `MyChannelProvider` is above this screen —
     * and where it does not, the page fetches on its own when it is next opened.
     */
    const invalidateAfter = useCallback(
        (action: FollowRequestAction) => {
            queryClient.invalidateQueries({ queryKey: channelKeys.followRequestsCount(activeId) })
            if (action !== 'accept') return
            queryClient.invalidateQueries({
                queryKey: channelKeys.myChannel(activeId),
                refetchType: 'none',
            })
            if (myChannel?.slug) {
                queryClient.invalidateQueries({
                    queryKey: channelKeys.stats(myChannel.slug, activeId),
                    refetchType: 'none',
                })
            }
        },
        [activeId, myChannel?.slug, queryClient],
    )

    const [exitingIds, setExitingIds] = useState<ReadonlySet<string>>(() => new Set())

    /** One timer per exiting row, so a second answer 100ms into the first's exit does not
     *  cancel it. Flushed rather than cancelled — see the effect below. */
    const exitTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>())

    /**
     * The bulk clear's own timer, kept apart from the per-row ones because it does not remove *a*
     * row — it replaces the whole cache entry, so there is nothing to key it by and only ever one
     * of it in flight.
     */
    const clearTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

    /**
     * Empty the list for real, once the rows have finished collapsing.
     *
     * `setExitingIds(new Set())` rather than removing ids one at a time: the rows it named are
     * gone from the cache in the same commit, so anything left in the set would be an id with no
     * row — and the next bulk press would start from a dirty set.
     */
    const finalizeClear = useCallback(() => {
        clearTimer.current = undefined
        queryClient.setQueryData<InfiniteData<FollowRequestsPage, PageCursor | null>>(
            queryKey,
            data => clearFollowRequests(data),
        )
        /*
         * The refetch behind the emptying, and the reason it is here rather than at the mutation:
         * invalidating while the rows were still animating would repopulate the list mid-exit.
         */
        queryClient.invalidateQueries({ queryKey })
        setExitingIds(previous => (previous.size === 0 ? previous : new Set()))
    }, [queryClient, queryKey])

    const finalizeExit = useCallback(
        (id: string) => {
            exitTimers.current.delete(id)
            /*
             * A bulk clear is already scheduled and will remove every row, this one included.
             * Letting this run would take the id out of `exitingIds` while its row is still in
             * the cache — so the row would fade *back in* for the remainder of the clear's
             * animation. Reachable: the bar is disabled while an answer is in flight, but not
             * while one is merely exiting.
             */
            if (clearTimer.current) return
            queryClient.setQueryData<InfiniteData<FollowRequestsPage, PageCursor | null>>(
                queryKey,
                data => removeFollowRequest(data, id),
            )
            setExitingIds(previous => {
                if (!previous.has(id)) return previous
                const next = new Set(previous)
                next.delete(id)
                return next
            })
        },
        [queryClient, queryKey],
    )

    /**
     * Leaving mid-animation **finishes** the removal rather than cancelling it.
     *
     * The request is already answered on the server by the time its timer is running — the exit
     * is the last 320ms of an operation that succeeded, not part of it. Simply clearing the
     * timers, which is the reflex, leaves the row in a cache with a 60s `staleTime`: come back
     * within the minute and it is still listed, with two buttons that now 404. Same reasoning,
     * at more length, in `useBlockedAccounts`.
     */
    useEffect(() => {
        const timers = exitTimers.current
        return () => {
            // The bulk clear first, and unconditionally: the server has already emptied the
            // queue, so a cache left holding rows is a list of answered requests waiting to be
            // answered again. It also short-circuits `finalizeExit` below, which is correct —
            // the clear removes every row those timers were going to remove.
            if (clearTimer.current) {
                clearTimeout(clearTimer.current)
                clearTimer.current = undefined
                finalizeClear()
            }
            // Snapshot first: `finalizeExit` deletes from this very Map.
            const pending = [...timers.entries()]
            timers.clear()
            for (const [id, timer] of pending) {
                clearTimeout(timer)
                finalizeExit(id)
            }
        }
    }, [finalizeClear, finalizeExit])

    const respondMutation = useMutation({
        mutationFn: ({ entry, action }: { entry: FollowRequest; action: FollowRequestAction }) =>
            action === 'accept'
                ? channelApi.acceptFollowRequest(entry.id)
                : channelApi.declineFollowRequest(entry.id),
        onSuccess: (_data, { entry, action }) => {
            setExitingIds(previous => new Set(previous).add(entry.id))
            exitTimers.current.set(
                entry.id,
                setTimeout(() => finalizeExit(entry.id), EXIT_MS),
            )
            invalidateAfter(action)

            const name = listUserName(entry.user) || entry.user.slug
            toast.success(
                name
                    ? t(
                          action === 'accept'
                              ? 'follow_requests_accepted'
                              : 'follow_requests_declined',
                          { name },
                      )
                    : t(
                          action === 'accept'
                              ? 'follow_requests_accepted_generic'
                              : 'follow_requests_declined_generic',
                      ),
                {
                    /*
                     * One id for the whole screen, as the blocked list does: answering three
                     * rows in a row replaces the toast instead of stacking three.
                     */
                    id: 'follow-requests-answered',
                },
            )
        },
        /*
         * One message for both verbs, and it is the honest one: what failed is the *answer*, and
         * a reader who pressed Decline does not need to be told which HTTP verb was refused.
         */
        meta: { showErrorToast: t('follow_requests_error_respond') },
    })

    /**
     * **One answer at a time, for the whole list** — the constraint `useBlockedAccounts` spells
     * out: `isPending` and `variables` describe the most recent run, so two overlapping presses
     * would leave one row spinning forever. The view disables every other row's buttons while
     * this is running, because a control that cannot act must not look like one.
     */
    const respond = useCallback(
        (entry: FollowRequest, action: FollowRequestAction) => {
            // Still guarded here as well as in the view: `disabled` is a rendered attribute and
            // a second tap can land in the same frame as the first, before it exists.
            if (respondMutation.isPending || exitingIds.has(entry.id)) return
            respondMutation.mutate({ entry, action })
        },
        [exitingIds, respondMutation],
    )

    const bulkMutation = useMutation({
        mutationFn: (action: FollowRequestAction) =>
            action === 'accept'
                ? channelApi.acceptAllFollowRequests()
                : channelApi.declineAllFollowRequests(),
        onSuccess: (_data, action) => {
            /*
             * The ids are read from the **cache**, not from the `entries` this render closed
             * over: a page may have landed while the bulk request was in flight, and a row on
             * screen that is not in the exiting set would sit there unanimated and then blink
             * out with the clear.
             */
            const loaded =
                queryClient.getQueryData<InfiniteData<FollowRequestsPage, PageCursor | null>>(
                    queryKey,
                )
            const ids = loaded?.pages.flatMap(p => p.results.map(row => row.id)) ?? []

            if (ids.length === 0) {
                // Nothing on screen to animate — usually the queue was already empty for this
                // browser. Clear now rather than scheduling an animation for no rows.
                finalizeClear()
            } else {
                setExitingIds(new Set(ids))
                clearTimer.current = setTimeout(finalizeClear, EXIT_MS)
            }
            invalidateAfter(action)
            toast.success(
                t(
                    action === 'accept'
                        ? 'follow_requests_accepted_all'
                        : 'follow_requests_declined_all',
                ),
                { id: 'follow-requests-answered' },
            )
        },
        meta: { showErrorToast: t('follow_requests_error_respond_all') },
    })

    const respondAll = useCallback(
        (action: FollowRequestAction) => {
            // Also refused while the previous clear is still animating: `isPending` is already
            // false there, and the view has taken the bar away, but a second press would
            // schedule a second timer over the first one's.
            if (bulkMutation.isPending || clearTimer.current) return
            bulkMutation.mutate(action)
        },
        [bulkMutation],
    )

    const entries = query.data?.pages.flatMap(page => page.results) ?? []

    /**
     * `fetchNextPage` guarded here rather than at the sentinel, and the dependencies are the
     * three values rather than `query` — see `useBlockedAccounts` for what depending on the
     * query object turns this into (a request per render for as long as the sentinel is
     * visible).
     */
    const { fetchNextPage, hasNextPage, isFetchingNextPage } = query
    const loadMore = useCallback(() => {
        if (!hasNextPage || isFetchingNextPage) return
        fetchNextPage()
    }, [fetchNextPage, hasNextPage, isFetchingNextPage])

    return {
        entries,
        total: query.data?.pages[0]?.count ?? 0,
        isLoading: query.isLoading,
        isError: query.isError,
        isEmpty: !query.isLoading && !query.isError && entries.length === 0,
        isSignedOut: !isAuthenticated,
        refetch: () => {
            query.refetch()
        },
        hasNextPage,
        isFetchingNextPage,
        loadMore,
        pendingId: respondMutation.isPending ? (respondMutation.variables?.entry.id ?? null) : null,
        pendingAction: respondMutation.isPending
            ? (respondMutation.variables?.action ?? null)
            : null,
        isResponding: respondMutation.isPending,
        exitingIds,
        respond,
        isBulkPending: bulkMutation.isPending,
        bulkAction: bulkMutation.isPending ? (bulkMutation.variables ?? null) : null,
        respondAll,
    }
}
