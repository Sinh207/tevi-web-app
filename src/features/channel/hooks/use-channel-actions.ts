'use client'

import { useAuth, useRequireAuth } from '@features/auth'
import { useTranslation } from '@shared/i18n/use-translation'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { channelApi, channelKeys } from '../api/channel-api'
import type { Channel, ChannelStats } from '../api/types'

/**
 * Follow / unfollow / unblock, as optimistic mutations over one cache entry.
 *
 * ## No event bus, deliberately
 *
 * Legacy broadcasts `CHANNEL_FOLLOW`, `UNFOLLOW`, `BLOCK`, `MUTE` through an emitter — because it
 * has **no shared cache**: three components each hold their own `is_followed` in `useState`, so
 * something has to tell them. With one `channelKeys.detail` entry there is nothing to broadcast:
 * `setQueryData` updates every subscriber synchronously, with no listener to miss, no ordering
 * question and no unmount leak. CLAUDE.md's rules say the same thing from the other direction —
 * the bus is for UI-only signals and "NEVER to sync server data", and every one of those events is
 * a server-state change.
 *
 * ## What is invalidated, and what is not
 *
 * `detail` and `stats` — not `channelKeys.all`, which would also drop the thread pages a follow does
 * not change. The one exception is a **protected** channel, where following genuinely changes which
 * threads are visible, so that case invalidates threads too. Narrow and justified beats broad and
 * safe here, because broad means re-fetching a feed on every tap.
 */
export function useChannelActions(channel: Channel) {
    const queryClient = useQueryClient()
    const { activeId } = useAuth()
    const requireAuth = useRequireAuth()
    const { t } = useTranslation()

    const detailKey = channelKeys.detail(channel.slug, activeId)
    const statsKey = channelKeys.stats(channel.slug, activeId)
    const isProtected = channel.privacy === 'protected'

    /** Patch the cached channel in place. Returns the snapshot so `onError` can put it back. */
    async function patchChannel(patch: Partial<Channel>) {
        await queryClient.cancelQueries({ queryKey: detailKey })
        const previous = queryClient.getQueryData<Channel>(detailKey)
        if (previous) queryClient.setQueryData<Channel>(detailKey, { ...previous, ...patch })
        return previous
    }

    /**
     * The follower count sits directly beside the button. A follow that does not move it reads as
     * having failed, so it moves optimistically and is floored at zero on the way back down.
     */
    async function bumpFollowers(delta: number) {
        await queryClient.cancelQueries({ queryKey: statsKey })
        const previous = queryClient.getQueryData<ChannelStats>(statsKey)
        if (previous) {
            queryClient.setQueryData<ChannelStats>(statsKey, {
                ...previous,
                follower_count: Math.max(0, previous.follower_count + delta),
            })
        }
        return previous
    }

    function settle({ threads = false }: { threads?: boolean } = {}) {
        queryClient.invalidateQueries({ queryKey: detailKey })
        queryClient.invalidateQueries({ queryKey: statsKey })
        if (threads) {
            /**
             * Both kinds for **this account only**. A prefix of `['channel','threads',slug]` would
             * also drop every other signed-in account's cached view of the same channel, and a follow
             * changes what *this* account can see and nothing else.
             */
            for (const kind of ['posts', 'media'] as const) {
                queryClient.invalidateQueries({
                    queryKey: channelKeys.threads(channel.slug, kind, activeId),
                })
            }
        }
    }

    const followMutation = useMutation({
        mutationFn: () => channelApi.follow(channel.slug),
        onMutate: async () => {
            /**
             * **A protected space does not become followed — it becomes requested.** `follow_requested`
             * exists for exactly this, and an optimistic `is_followed: true` would drop the wall and
             * show the visitor a body they still cannot see. See B14.
             */
            const channelSnapshot = await patchChannel({
                is_followed: !isProtected,
                follow_requested: isProtected,
            })
            // A pending request is not a follower, so the count only moves for a public space.
            const statsSnapshot = isProtected ? undefined : await bumpFollowers(1)
            return { channelSnapshot, statsSnapshot }
        },
        onError: (_error, _vars, context) => {
            if (context?.channelSnapshot) {
                queryClient.setQueryData(detailKey, context.channelSnapshot)
            }
            if (context?.statsSnapshot) queryClient.setQueryData(statsKey, context.statsSnapshot)
        },
        // A successful follow on a protected space changes which threads are visible.
        onSuccess: () => settle({ threads: isProtected }),
        meta: {
            // A **message**, not a key: the toast is raised in `query-client.ts`, outside React,
            // where there is no `t`. Passing the key ships `channel_error_follow` to the user.
            showErrorToast: t('channel_error_follow'),
        },
    })

    const unfollowMutation = useMutation({
        mutationFn: () => channelApi.unfollow(channel.slug),
        onMutate: async () => {
            const channelSnapshot = await patchChannel({
                is_followed: false,
                follow_requested: false,
            })
            const statsSnapshot = channel.is_followed ? await bumpFollowers(-1) : undefined
            return { channelSnapshot, statsSnapshot }
        },
        onError: (_error, _vars, context) => {
            if (context?.channelSnapshot) {
                queryClient.setQueryData(detailKey, context.channelSnapshot)
            }
            if (context?.statsSnapshot) queryClient.setQueryData(statsKey, context.statsSnapshot)
        },
        onSuccess: () => settle({ threads: isProtected }),
        meta: { showErrorToast: t('channel_error_unfollow') },
    })

    /**
     * **Not optimistic**, unlike the follow pair.
     *
     * Unblocking flips the page out of a terminal state. An optimistic version would tear the wall
     * down and — if the request failed — rebuild it in the reader's face, which is a worse thing to
     * do than making them wait for a pending button. Same reason block itself is not optimistic
     * (that entry point ships with the overflow menu; see the plan).
     */
    const unblockMutation = useMutation({
        mutationFn: () => channelApi.unblockUser(channel.owner_id),
        onSuccess: () => {
            queryClient.setQueryData<Channel>(detailKey, previous =>
                previous ? { ...previous, blocking_channel: false } : previous,
            )
            settle()
        },
        meta: { showErrorToast: t('channel_error_unblock') },
    })

    /**
     * `useRequireAuth` wraps the **handler**, never the mutation.
     *
     * Two reasons. It swallows the callback when the visitor is anonymous, so inside the hook
     * `mutate()` would sometimes silently do nothing — an awful mutation API. And the component is
     * what knows which affordances need the gate: Follow does, Share and Copy link do not.
     */
    return {
        follow: {
            run: requireAuth(() => followMutation.mutate()),
            isPending: followMutation.isPending,
        },
        unfollow: {
            run: requireAuth(() => unfollowMutation.mutate()),
            isPending: unfollowMutation.isPending,
        },
        unblock: {
            run: requireAuth(() => unblockMutation.mutate()),
            isPending: unblockMutation.isPending,
        },
    }
}
