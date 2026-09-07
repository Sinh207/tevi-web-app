'use client'

import { useAuth } from '@features/auth'
import { useTranslation } from '@shared/i18n/use-translation'
import type { PageCursor } from '@shared/lib/api/page-cursor'
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { forgetInboxCache, notificationApi, notificationKeys } from '../api/notification-api'
import type { InboxMessage } from '../api/types'
import {
    type InboxData,
    nextInboxCursor,
    removeInboxMessage,
    setInboxRead,
} from '../lib/inbox-page'

/**
 * The inbox screen's whole state: the paginated list, the per-row read toggle, the per-row delete,
 * and "mark all as read".
 *
 * Built on `useFollowRequests` and `useBlockedAccounts`, which are the same shape of screen —
 * read either for why the removal animation lives in the hook rather than in the component, and
 * why it is a timer rather than an `animationend` listener. What follows is only what this screen
 * does *differently*, and there are three things.
 *
 * ## 1. The read toggle is **optimistic**; the delete is not
 *
 * Everywhere else in this app a row waits for the server before it changes (`useBlockedAccounts`
 * makes the argument: a row that vanishes and comes back is worse than a button that spins for
 * 300ms). Marking read is the case that inverts it, for two reasons that only hold here:
 *
 * - It fires as a **side effect of following a link.** Press a notification and the browser starts
 *   navigating; there is no row left on screen to spin, and by the time the response lands the
 *   reader is on another page. Waiting would mean the tint never updates on the way out.
 * - It is **reversible and cheap.** If the request fails, the flag goes back — the row is still
 *   there, nothing was destroyed, and the reader can press again. `onError` restores the previous
 *   value rather than refetching, so a failure costs nothing and says nothing.
 *
 * Delete keeps the app's normal rule: the row leaves after the server agrees, because an archive
 * that silently failed would show a notification the reader believes they cleared.
 *
 * ## 2. The read toggle is **not** single-flight
 *
 * Two rows can be marked read at once and that is the ordinary case — a reader opens a
 * notification, comes back, opens another. `pendingReads` is a `Set` rather than a mutation's
 * `isPending`, precisely because `isPending`/`variables` describe the *latest* run: with one flag,
 * the second press would either be refused or would take over the first row's spinner. Delete
 * stays single-flight, since it is the destructive one and the row is gone either way.
 *
 * ## 3. "Mark all as read" is **not** here
 *
 * It is `useMarkInboxRead`, because its control is in the page bar rather than in the list — see
 * that hook for why the two are apart and how the list still repaints.
 */

/**
 * The exit animation's length, in milliseconds. **Must match `tevi-row-collapse`'s duration in
 * `globals.css`** — the CSS plays it and this schedules the cache write behind it. Same constant,
 * same duty, as in `useFollowRequests`.
 */
const EXIT_MS = 320

export interface UseInboxResult {
    /** Every loaded notification, flattened — the page structure never reaches the component. */
    messages: InboxMessage[]
    /** The server's total, not the number loaded. `0` until the first page lands. */
    total: number
    isLoading: boolean
    isError: boolean
    /** The first page came back and held nothing. */
    isEmpty: boolean
    /** The inbox needs a real account; an anonymous session has none. */
    isSignedOut: boolean
    refetch: () => void
    hasNextPage: boolean
    isFetchingNextPage: boolean
    loadMore: () => void
    /** The row being deleted, so its control can spin and the rest can be held. */
    removingId: string | null
    /** Rows playing their exit. Still mounted, already gone as far as the reader is concerned. */
    exitingIds: ReadonlySet<string>
    /**
     * Mark one notification read or unread. A no-op when the row is already in that state, which
     * is what makes it safe to call unconditionally from the row's press handler.
     */
    setRead: (message: InboxMessage, read: boolean) => void
    /** Delete (wire: archive) one notification. */
    remove: (message: InboxMessage) => void
}

export function useInbox(): UseInboxResult {
    const { activeId, isAuthenticated } = useAuth()
    const queryClient = useQueryClient()
    const { t } = useTranslation()

    /**
     * Memoised, and not as a micro-optimisation: `notificationKeys.inbox` builds a **new array**
     * every call, so an un-memoised key would give the finalisers below a new identity on every
     * render — and the unmount effect, which must run its cleanup exactly once per account, is
     * keyed on that identity.
     */
    const queryKey = useMemo(() => notificationKeys.inbox(activeId), [activeId])
    const unreadKey = useMemo(() => notificationKeys.unread(activeId), [activeId])

    const query = useInfiniteQuery({
        queryKey,
        initialPageParam: null as PageCursor | null,
        queryFn: ({ pageParam, signal }) =>
            notificationApi.getInbox({ cursor: pageParam, accountId: activeId, signal }),
        getNextPageParam: (last, _pages, lastParam) => nextInboxCursor(last, lastParam),
        enabled: isAuthenticated,
    })

    const [pendingReads, setPendingReads] = useState<ReadonlySet<string>>(() => new Set())
    const [exitingIds, setExitingIds] = useState<ReadonlySet<string>>(() => new Set())

    /** One timer per exiting row, so a second delete 100ms into the first's exit does not cancel
     *  it. Flushed rather than cancelled on unmount — see the effect below. */
    const exitTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>())

    const releasePending = useCallback((id: string) => {
        setPendingReads(previous => {
            if (!previous.has(id)) return previous
            const next = new Set(previous)
            next.delete(id)
            return next
        })
    }, [])

    const finalizeExit = useCallback(
        (id: string) => {
            exitTimers.current.delete(id)
            queryClient.setQueryData<NonNullable<InboxData>>(queryKey, data =>
                removeInboxMessage(data, id),
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
     * The notification is already archived on the server by the time its timer is running — the
     * exit is the last 320ms of an operation that succeeded, not part of it. Clearing the timers,
     * which is the reflex, leaves the row in a cache with a 60s `staleTime`: come back within the
     * minute and it is listed again, with a Delete that now 404s. Same reasoning, at more length,
     * in `useBlockedAccounts`.
     */
    useEffect(() => {
        const timers = exitTimers.current
        return () => {
            // Snapshot first: `finalizeExit` deletes from this very Map.
            const pending = [...timers.entries()]
            timers.clear()
            for (const [id, timer] of pending) {
                clearTimeout(timer)
                finalizeExit(id)
            }
        }
    }, [finalizeExit])

    const setReadMutation = useMutation({
        mutationFn: ({ message, read }: { message: InboxMessage; read: boolean }) =>
            read
                ? notificationApi.read(message.id, activeId)
                : notificationApi.unread(message.id, activeId),
        /*
         * Optimistic, for the two reasons at the top of this file. The write happens here rather
         * than in `onSuccess` so the tint has already changed by the time a link navigation takes
         * the row off screen.
         */
        onMutate: ({ message, read }) => {
            setPendingReads(previous => new Set(previous).add(message.id))
            queryClient.setQueryData<NonNullable<InboxData>>(queryKey, data =>
                setInboxRead(data, message.id, read),
            )
            return { previous: message.read }
        },
        onError: (_error, { message }, context) => {
            /*
             * Put the flag back, rather than invalidating: an invalidation would refetch every
             * loaded page to correct one boolean, and on a failed *unread* it would also reorder
             * nothing while costing four requests. `context` carries the value the row actually
             * had, so a double press cannot restore the wrong one.
             */
            const restore = context?.previous ?? false
            queryClient.setQueryData<NonNullable<InboxData>>(queryKey, data =>
                setInboxRead(data, message.id, restore),
            )
            /*
             * Silent. This fires on a row the reader has usually already navigated away from, and
             * the only consequence of the failure is that a dot stays lit — telling them about it
             * would be a toast for something they did not ask to do and cannot act on. A *failed
             * delete* is told about, below, because that one is an action they pressed on purpose.
             */
        },
        onSettled: async (_data, _error, { message }) => {
            releasePending(message.id)
            /*
             * The stored ETag goes first, and it is `await`ed rather than fired off: the
             * invalidation below issues a request, and a request that still carries
             * `If-None-Match` can be answered 304 with the pre-write body. `forgetInboxCache`
             * has the full reasoning and the precedent (**B72**).
             */
            await forgetInboxCache(activeId)
            // The dot counts rows this client has never loaded, so it is asked rather than
            // computed — the one thing a local write cannot do. Also correct after a failure: it
            // reconciles whatever the server really thinks.
            queryClient.invalidateQueries({ queryKey: unreadKey })
        },
    })

    const setRead = useCallback(
        (message: InboxMessage, read: boolean) => {
            // Already in that state, or a second press landed in the same frame as the first.
            // Guarded here rather than at the call site because the row's press handler calls
            // this unconditionally — "open and mark read" is one gesture.
            if (message.read === read) return
            if (pendingReads.has(message.id)) return
            setReadMutation.mutate({ message, read })
        },
        [pendingReads, setReadMutation],
    )

    const removeMutation = useMutation({
        mutationFn: (message: InboxMessage) => notificationApi.archive(message.id, activeId),
        onSuccess: async (_data, message) => {
            setExitingIds(previous => new Set(previous).add(message.id))
            exitTimers.current.set(
                message.id,
                setTimeout(() => finalizeExit(message.id), EXIT_MS),
            )
            /*
             * The archived row is gone from the endpoint's body now, so a stored validator would
             * bring it back on the next conditional GET — with a Delete that 404s. Awaited before
             * the invalidation, for the reason `forgetInboxCache` gives.
             */
            await forgetInboxCache(activeId)
            // Deleting an *unread* notification changes the dot; deleting a read one does not.
            // Asked either way rather than branched on, because the flag in hand may be stale and
            // the request is one row wide.
            queryClient.invalidateQueries({ queryKey: unreadKey })
            toast.success(t('notification_deleted'), {
                // One id for the whole screen: deleting three rows in a row replaces the toast
                // instead of stacking three.
                id: 'notification-action',
            })
        },
        meta: { showErrorToast: t('notification_error_delete') },
    })

    /**
     * **One delete at a time**, and not because the server minds: `isPending` and `variables`
     * describe the most recent run, so two overlapping presses would leave one row spinning
     * forever. The row disables its own control while this is running.
     */
    const remove = useCallback(
        (message: InboxMessage) => {
            if (removeMutation.isPending || exitingIds.has(message.id)) return
            removeMutation.mutate(message)
        },
        [exitingIds, removeMutation],
    )

    const messages = query.data?.pages.flatMap(page => page.results) ?? []

    /**
     * `fetchNextPage` guarded here rather than at the sentinel, and the dependencies are the three
     * values rather than `query` — depending on the query object turns this into a request per
     * render for as long as the sentinel is visible (`useBlockedAccounts` has the long version).
     */
    const { fetchNextPage, hasNextPage, isFetchingNextPage } = query
    const loadMore = useCallback(() => {
        if (!hasNextPage || isFetchingNextPage) return
        fetchNextPage()
    }, [fetchNextPage, hasNextPage, isFetchingNextPage])

    return {
        messages,
        total: query.data?.pages[0]?.count ?? 0,
        isLoading: query.isLoading,
        isError: query.isError,
        isEmpty: !query.isLoading && !query.isError && messages.length === 0,
        isSignedOut: !isAuthenticated,
        refetch: () => {
            query.refetch()
        },
        hasNextPage,
        isFetchingNextPage,
        loadMore,
        /*
         * `pendingReads` is deliberately **not** returned. It is the single-flight guard for
         * `setRead` and nothing renders from it: the read toggle is optimistic, so there is no
         * spinner for it to drive. An exported field nothing reads is the failure the event bus's
         * "every declared event must have an emitter" rule describes from the other side — it looks
         * like an integration point and is not one.
         */
        removingId: removeMutation.isPending ? (removeMutation.variables?.id ?? null) : null,
        exitingIds,
        setRead,
        remove,
    }
}
