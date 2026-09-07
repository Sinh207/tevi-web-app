'use client'

import { useAuth } from '@features/auth'
import { useTranslation } from '@shared/i18n/use-translation'
import type { PageCursor } from '@shared/lib/api/page-cursor'
import {
    type InfiniteData,
    keepPreviousData,
    useInfiniteQuery,
    useMutation,
    useQueryClient,
} from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { channelApi, channelKeys } from '../api/channel-api'
import {
    FOLLOWED_ORDERINGS,
    type FollowedChannel,
    type FollowedOrdering,
    isFollowedChannelMuted,
} from '../api/types'
import {
    FOLLOWING_WARN_AT,
    type FollowedChannelsPage,
    movePinnedFollowedChannel,
    nextFollowedCursor,
    patchFollowedChannel,
    removeFollowedChannel,
} from '../lib/following-page'

/**
 * The `/following` list's whole state: the paginated rows, the ordering, the three per-row writes,
 * and the five-second window in which an unfollow can still be taken back.
 *
 * Built on `useBlockedAccounts` and `useFollowRequests` — the same shape of screen — so read either
 * of those for why the exit animation lives in the hook rather than the component, and why it is a
 * timer rather than an `animationend` listener. What follows is only what this screen does
 * *differently*, and it differs in one important way.
 *
 * ## Unfollow is deferred, not undone
 *
 * The other two screens act on the server first and offer an Undo that issues the **opposite**
 * request: unblock, then re-block. That does not work here, and the reason is not squeamishness
 * about a wasted round trip — **following is not always the inverse of unfollowing.** A follow on a
 * *protected* space becomes a pending request rather than a follow (see `useChannelActions`), so an
 * "Undo" that re-follows would silently downgrade an established follow into a queue entry the
 * creator has to approve, and the reader would have lost access to a space by pressing the button
 * that promised to put it back.
 *
 * So the press schedules the request instead of making it: the row leaves at once, and five seconds
 * later the POST goes out — unless Undo cancels the timer, in which case nothing was ever sent and
 * there is nothing to put back. This is legacy's design (`useFollowedChannels`) and it is the right
 * one for exactly the reason above.
 *
 * **The row stays in the cache for those five seconds**, marked exiting rather than removed. That is
 * what makes Undo a one-line state change instead of a re-insertion: putting a removed row back
 * means deciding where it goes, and the two orderings this screen offers have different answers.
 *
 * ## What legacy gets wrong here, and this does not
 *
 * Its cleanup is `clearTimeout` on unmount, so **navigating away inside the window cancels the
 * unfollow entirely** — the row is gone from the screen, the request was never sent, and the space
 * is still followed the next time the list loads. Here unmount **flushes**: the timers are cleared
 * and every pending unfollow is sent. The press was the instruction; Undo is the exception, and
 * leaving the screen is not pressing it.
 *
 * ## Pin and mute patch, then refetch
 *
 * Both write one field, so the mark appears immediately (`patchFollowedChannel`) and the request
 * settles behind it. Pin additionally invalidates, because pinning changes the *order* and the
 * order is the server's — see `patchFollowedChannel` for why this client does not sort the loaded
 * pages itself the way legacy does.
 */

/**
 * How long an unfollow can be taken back — legacy's five seconds, and the toast's duration is held
 * to the same number so the offer disappears exactly when it stops being true.
 */
const UNDO_MS = 5000

export interface UseFollowedChannelsResult {
    /** Every loaded row, flattened — the page structure never reaches the component. */
    entries: FollowedChannel[]
    /** The server's total, not the number loaded. `0` until the first page lands. */
    total: number
    ordering: FollowedOrdering
    setOrdering: (ordering: FollowedOrdering) => void
    isLoading: boolean
    isError: boolean
    /**
     * A different ordering has been asked for and the rows on screen are still the previous one's
     * — see `placeholderData` in the query. The view dims the list rather than replacing it.
     */
    isReordering: boolean
    /** The first page came back and held nothing. */
    isEmpty: boolean
    /** The list needs a real account; an anonymous session follows nobody. */
    isSignedOut: boolean
    /**
     * The account is following more spaces than the backend's soft limit — the screen says so.
     * A notice, not a gate: see `FOLLOWING_WARN_AT`.
     */
    isOverLimit: boolean
    refetch: () => void
    hasNextPage: boolean
    isFetchingNextPage: boolean
    loadMore: () => void
    /** The slug whose write is in flight, so its row can show it. */
    pendingSlug: string | null
    /** Rows on their way out — an unfollow inside its undo window. */
    exitingSlugs: ReadonlySet<string>
    /** Pin or unpin, depending on the row's current state. */
    togglePin: (channel: FollowedChannel) => void
    /** Mute or unmute — the same `follow/` endpoint with the notification flag. */
    toggleMute: (channel: FollowedChannel) => void
    /** Hide the row and schedule the unfollow. Undoable for `UNDO_MS`. */
    unfollow: (channel: FollowedChannel) => void
}

export function useFollowedChannels(): UseFollowedChannelsResult {
    const { activeId, isAuthenticated } = useAuth()
    const queryClient = useQueryClient()
    const { t } = useTranslation()

    const [ordering, setOrdering] = useState<FollowedOrdering>(FOLLOWED_ORDERINGS[0])

    /**
     * Memoised for the reason the other two lists state: `channelKeys.followed` builds a **new
     * array** every call, and the flush effect below must run its cleanup exactly once per
     * (account, ordering) — which is keyed on this identity.
     */
    const queryKey = useMemo(() => channelKeys.followed(activeId, ordering), [activeId, ordering])

    const query = useInfiniteQuery({
        queryKey,
        initialPageParam: null as PageCursor | null,
        queryFn: ({ pageParam, signal }) =>
            channelApi.getFollowedChannels({
                cursor: pageParam,
                ordering,
                accountId: activeId,
                signal,
            }),
        getNextPageParam: (last, _pages, lastParam) => nextFollowedCursor(last, lastParam),
        enabled: isAuthenticated,
        /**
         * **Changing the sort must not flash the skeleton over a list that is already on screen.**
         *
         * The ordering is part of the query key, so without this the second sort is a cold query:
         * `isLoading` goes true, the rows are replaced by eight shimmer bars, and they come back in
         * a different order — for an operation the reader thinks of as *re-arranging what they are
         * looking at*. `keepPreviousData` keeps the old ordering's rows mounted until the new one
         * lands, and `isReordering` (`isPlaceholderData`) is how the view says it is working.
         *
         * The cost is honest and small: for a few hundred milliseconds the control reads the new
         * ordering while the rows are still in the old one. That is why the view dims the list and
         * marks it `aria-busy` rather than leaving it looking settled.
         *
         * It is **only** correct because both orderings are the same set of rows. On a query whose
         * key change means *different data* (a search term, another account) this would show one
         * answer under another question, which is why it is not on the blocked list's search.
         */
        placeholderData: keepPreviousData,
    })

    /** Rows hidden pending an unfollow. Keyed by slug — the only identifier this screen acts on. */
    const [exitingSlugs, setExitingSlugs] = useState<ReadonlySet<string>>(() => new Set())

    /**
     * The scheduled unfollows: slug → its timer.
     *
     * A `Map` and not a single pending slug, so unfollowing a second space 200ms into the first's
     * window does not cancel it — legacy flushes the previous one on the next press, which works
     * but means the undo bar for row two silently commits row one. Here both windows run and both
     * toasts carry their own Undo.
     */
    const undoTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>())

    /**
     * The latest `t`, behind a ref — and this is **load-bearing, not a micro-optimisation.**
     *
     * The flush effect below has to run its cleanup at exactly **two** moments — unmount and an
     * account switch — because running it *sends* every scheduled unfollow. (Not an ordering
     * change: the row is removed from every ordering's cache anyway, so there is nothing for a
     * re-sort to flush.) Its dependency chain is `commitUnfollow` → `sendUnfollow`, so anything
     * unstable in there flushes the window one render after it opened and Undo becomes unreachable
     * — the five seconds collapse to nothing and the button is decoration. `useTranslation` makes
     * no promise that `t` is referentially stable across renders, which is exactly the kind of
     * thing that is true today and false after an i18next upgrade. A ref takes it out of the chain
     * entirely.
     *
     * Written in an effect rather than during render: this is only read from a timer or a rejected
     * promise, both of which are long after commit, so there is nothing to gain from mutating
     * during the render pass and a rule to break by doing it.
     */
    const translate = useRef(t)
    useEffect(() => {
        translate.current = t
    }, [t])

    /**
     * Send the request, once the window has closed.
     *
     * A bare call rather than a `useMutation`, and that is not an oversight: by the time this runs
     * the reader has moved on — the row left five seconds ago and the toast has gone — so there is
     * no pending state for a component to render and nothing for `variables` to describe. What a
     * failure needs is a sentence saying the space is *still* followed and a list that reflects it,
     * which is what the `catch` does.
     *
     * The invalidation of that space's own page happens either way: whether the unfollow landed or
     * not, this client no longer knows what its Follow button should say.
     */
    const sendUnfollow = useCallback(
        (slug: string) => {
            channelApi.unfollow(slug, activeId).catch(() => {
                /*
                 * Its **own** toast id, not the `following-action` one the pin and mute toasts
                 * share. This arrives five seconds after the press, by which time the reader may
                 * well have pinned something — and a shared id would have that success replace a
                 * message saying a space they think they unfollowed is still followed. The two are
                 * not interchangeable, so they do not share a slot.
                 */
                toast.error(translate.current('following_error_unfollow', { slug }), {
                    id: `following-unfollow-failed-${slug}`,
                })
                // The row is out of the cache and the space is still followed. Only a refetch can
                // reconcile that, and it has to reach both orderings.
                queryClient.invalidateQueries({ queryKey: channelKeys.followedAll(activeId) })
            })
            queryClient.invalidateQueries({ queryKey: channelKeys.detail(slug, activeId) })
        },
        [activeId, queryClient],
    )

    /**
     * The window has closed: send the unfollow and take the row out of the cache.
     *
     * The row is dropped from **every** ordering (`followedAll`) rather than only the list on
     * screen, because the other ordering's pages still hold it and a 60s `staleTime` is long enough
     * for a reader to flip the sort and be offered an Unfollow on a space they already unfollowed.
     * `setQueriesData` walks the cached entries under that prefix, which is both cheaper and more
     * exact than refetching them.
     */
    const commitUnfollow = useCallback(
        (slug: string) => {
            undoTimers.current.delete(slug)
            sendUnfollow(slug)
            queryClient.setQueriesData<InfiniteData<FollowedChannelsPage, PageCursor | null>>(
                { queryKey: channelKeys.followedAll(activeId) },
                data => removeFollowedChannel(data, slug),
            )
            setExitingSlugs(previous => {
                if (!previous.has(slug)) return previous
                const next = new Set(previous)
                next.delete(slug)
                return next
            })
        },
        [activeId, queryClient, sendUnfollow],
    )

    /**
     * Leaving the screen **sends** every scheduled unfollow rather than cancelling it — the fix for
     * legacy's `clearTimeout`-only cleanup, which loses the unfollow altogether. Same shape as the
     * flush in `useBlockedAccounts`, and the same reasoning: the operation succeeded as far as the
     * reader is concerned, so the cleanup has to finish it rather than abandon it.
     */
    useEffect(() => {
        const timers = undoTimers.current
        return () => {
            // Snapshot first: `commitUnfollow` deletes from this very Map.
            const pending = [...timers.entries()]
            timers.clear()
            for (const [slug, timer] of pending) {
                clearTimeout(timer)
                commitUnfollow(slug)
            }
        }
    }, [commitUnfollow])

    const unfollow = useCallback(
        (channel: FollowedChannel) => {
            const { slug } = channel
            // A second press inside the window is a no-op, not a second timer.
            if (undoTimers.current.has(slug)) return

            setExitingSlugs(previous => new Set(previous).add(slug))
            undoTimers.current.set(
                slug,
                setTimeout(() => commitUnfollow(slug), UNDO_MS),
            )

            toast.success(t('following_unfollowed', { name: channel.name || `@${slug}` }), {
                /*
                 * Per-slug id, unlike the blocked list's one-per-screen: two windows can be open at
                 * once here (see `undoTimers`), and each toast's Undo refers to its own row, so
                 * collapsing them would leave one row's offer pointing at the other's.
                 */
                id: `following-undo-${slug}`,
                duration: UNDO_MS,
                action: {
                    label: t('following_undo'),
                    onClick: () => {
                        const timer = undoTimers.current.get(slug)
                        if (timer === undefined) return
                        clearTimeout(timer)
                        undoTimers.current.delete(slug)
                        setExitingSlugs(previous => {
                            const next = new Set(previous)
                            next.delete(slug)
                            return next
                        })
                    },
                },
            })
        },
        [commitUnfollow, t],
    )

    /**
     * Pin and mute, as one mutation over a `(slug, action)` pair.
     *
     * One rather than two for the reason `useFollowRequests` gives about accept and decline: they
     * are different requests but the same *interaction* — one row, one menu item, one field changes
     * — so a mutation apiece would mean two `isPending` flags and a row that has to ask both which
     * of them it is waiting on. Unfollow is genuinely not one of these, because it does not go
     * through a mutation at all (see above).
     */
    const writeMutation = useMutation({
        mutationFn: ({ channel, action }: { channel: FollowedChannel; action: 'pin' | 'mute' }) => {
            if (action === 'pin') {
                return channel.pin
                    ? channelApi.unpinChannel(channel.slug, activeId)
                    : channelApi.pinChannel(channel.slug, activeId)
            }
            // Mute is the `follow/` endpoint with the flag — there is no mute route. `notification`
            // is the value being written, so muting sends `false`.
            return channelApi.follow(channel.slug, isFollowedChannelMuted(channel), activeId)
        },
        /**
         * Optimistic, and for pin it is not a nicety — it is the only correct answer.
         *
         * `POST .../pin/` returns before `GET followed-channels/` can see the write, so the refetch
         * this used to fire came back with the **old** order and often the old flag: the press looked
         * like it had done nothing, then the row jumped a second later, or never. Reported from the
         * real screen. So the client performs the move (`movePinnedFollowedChannel` states the rule)
         * and there is no refetch to be stale — see `onSuccess`.
         *
         * Mute has no such problem to solve and stays a flag patch: it reorders nothing, so there is
         * nothing for a later read to disagree with.
         *
         * ## Both write to **every** cached ordering, not just the one on screen
         *
         * The two sort orders are two cache entries (`channelKeys.followed` puts the ordering in the
         * key), and a 60s `staleTime` is long enough for a reader to pin something, flip the sort and
         * find it unpinned. `setQueriesData` over the `followedAll` prefix walks both; `getQueriesData`
         * is what makes that undoable, since the rollback has to put back more than one entry.
         */
        onMutate: async ({ channel, action }) => {
            const scope = { queryKey: channelKeys.followedAll(activeId) }
            await queryClient.cancelQueries(scope)
            const previous =
                queryClient.getQueriesData<InfiniteData<FollowedChannelsPage, PageCursor | null>>(
                    scope,
                )

            if (action === 'pin') {
                queryClient.setQueriesData<InfiniteData<FollowedChannelsPage, PageCursor | null>>(
                    scope,
                    data => movePinnedFollowedChannel(data, channel.slug, !channel.pin),
                )
            } else {
                const patch: Partial<FollowedChannel> = {
                    notification_settings: { notification: isFollowedChannelMuted(channel) },
                }
                queryClient.setQueriesData<InfiniteData<FollowedChannelsPage, PageCursor | null>>(
                    scope,
                    data => patchFollowedChannel(data, channel.slug, patch),
                )
            }
            return { previous }
        },
        onError: (_error, _variables, context) => {
            // Every entry the optimistic write touched, back exactly as it was — including the
            // ordering that is not on screen, which is the one nobody would notice staying wrong.
            for (const [key, data] of context?.previous ?? []) {
                queryClient.setQueryData(key, data)
            }
        },
        onSuccess: (_data, { channel, action }) => {
            const name = channel.name || `@${channel.slug}`
            if (action === 'pin') {
                toast.success(
                    t(channel.pin ? 'following_unpinned' : 'following_pinned', { name }),
                    { id: 'following-action' },
                )
                /*
                 * **No invalidation, deliberately.** The row has already moved, in `onMutate`, and a
                 * refetch here is precisely what was broken: `POST .../pin/` returns before
                 * `GET followed-channels/` can see the write, so the read came back with the pre-pin
                 * order and undid the thing the reader had just watched happen. The list refreshes on
                 * its own once it goes stale, by which point the backend agrees.
                 *
                 * ⚠ **The move is not animated.** React keys the rows by slug, so the DOM node is
                 * reused and simply appears in its new position. Animating it needs a FLIP pass or a
                 * `view-transition-name` per row — infrastructure this app does not have and should
                 * not grow for one list. It reads acceptably because the move is now in the *same*
                 * frame as the press rather than a round trip later: one jump, not a jump that
                 * arrives after the feedback.
                 */
                return
            }
            toast.success(
                t(isFollowedChannelMuted(channel) ? 'following_unmuted' : 'following_muted', {
                    name,
                }),
                { id: 'following-action' },
            )
            /*
             * Mute changes no order, so nothing is refetched here — but that space's own page
             * renders the same preference on its notification control, so its entry has to go.
             */
            queryClient.invalidateQueries({ queryKey: channelKeys.detail(channel.slug, activeId) })
        },
        meta: { showErrorToast: t('following_error_write') },
    })

    const togglePin = useCallback(
        (channel: FollowedChannel) => {
            if (writeMutation.isPending || exitingSlugs.has(channel.slug)) return
            writeMutation.mutate({ channel, action: 'pin' })
        },
        [exitingSlugs, writeMutation],
    )

    const toggleMute = useCallback(
        (channel: FollowedChannel) => {
            if (writeMutation.isPending || exitingSlugs.has(channel.slug)) return
            writeMutation.mutate({ channel, action: 'mute' })
        },
        [exitingSlugs, writeMutation],
    )

    const entries = query.data?.pages.flatMap(page => page.results) ?? []
    const total = query.data?.pages[0]?.count ?? 0

    /**
     * `fetchNextPage` guarded here rather than at the sentinel, and depending on the four values
     * rather than on `query` — see `useBlockedAccounts` for what depending on the query object
     * turns this into (a request per render for as long as the sentinel is visible).
     *
     * `isPlaceholderData` is in the guard because of `keepPreviousData` above: while the previous
     * ordering's rows are standing in, `hasNextPage` describes *that* list, so a sentinel scrolled
     * into view would ask the new query for a page number counted off the old one's cursor. Waiting
     * costs nothing — the first page of the new ordering is already in flight.
     */
    const { fetchNextPage, hasNextPage, isFetchingNextPage, isPlaceholderData } = query
    const loadMore = useCallback(() => {
        if (!hasNextPage || isFetchingNextPage || isPlaceholderData) return
        fetchNextPage()
    }, [fetchNextPage, hasNextPage, isFetchingNextPage, isPlaceholderData])

    return {
        entries,
        total,
        ordering,
        setOrdering,
        isLoading: query.isLoading,
        isError: query.isError,
        isReordering: isPlaceholderData,
        /*
         * Rows inside their undo window do not count: unfollowing the last space has to land on the
         * empty state rather than on an empty list with a header above it.
         */
        isEmpty:
            !query.isLoading &&
            !query.isError &&
            entries.every(entry => exitingSlugs.has(entry.slug)),
        isSignedOut: !isAuthenticated,
        isOverLimit: total > FOLLOWING_WARN_AT,
        refetch: () => {
            query.refetch()
        },
        hasNextPage,
        isFetchingNextPage,
        loadMore,
        pendingSlug: writeMutation.isPending
            ? (writeMutation.variables?.channel.slug ?? null)
            : null,
        exitingSlugs,
        togglePin,
        toggleMute,
        unfollow,
    }
}
