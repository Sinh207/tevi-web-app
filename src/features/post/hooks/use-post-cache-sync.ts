'use client'

import { useAuth } from '@features/auth'
import { eventBus } from '@shared/lib/event-bus'
import { type QueryClient, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { forgetPostDetailCache, postApi, postKeys } from '../api/post-api'
import type { Post } from '../api/types'
import {
    holdsPost,
    membershipLockedPostIds,
    postIdsOfChannel,
    replacePosts,
} from '../lib/post-cache'

/**
 * How many detail reads run at once. A space page plus Bookmarks can hold a few dozen of one
 * space's posts; firing them all at once would only queue in the browser and crowd out the page.
 */
const CONCURRENCY = 4

/**
 * The ceiling on one refresh. A card settle re-reads every membership-locked post in the cache
 * because it cannot tell which space it was for; on a long scrolled feed that is unbounded, and a
 * post past this many is one the reader has scrolled far away from — it corrects on its next read.
 */
const MAX_POSTS = 40

/**
 * Keep every cached post in step with what this account has just bought — **the one listener**.
 *
 * | event | from | re-reads |
 * |---|---|---|
 * | `post:purchased` | `usePostUnlock` | that post |
 * | `membership:joined` | `useJoinMembership` (Star) | every cached post of that space |
 * | `payment:succeeded` | `PaymentProvider` (card) | every cached post a membership locks |
 *
 * ## Why one listener and not a call at each press
 *
 * The press does not know which screens are open, and the lists are not this feature's: the home
 * feed, a space's threads, Bookmarks, a collection, the detail page — and a membership can be
 * joined on five surfaces, none of which owns a post. On the bus, the emitter says what happened
 * and this decides what it means for posts, in one place.
 *
 * ## Why the detail, and why patch
 *
 * The list endpoints answer with the locked row still (Bookmarks did, after a refetch with the
 * validators dropped); the detail does not, and it is what legacy re-reads (`handleGetPostById`).
 * So each post's detail is fetched and written into every entry holding it — an HTTP read, not a
 * socket frame, so CLAUDE.md's "a signal, never a source" is kept: the event carries an id, the
 * data comes from the API. **No list is refetched**, which would put the stale row straight back.
 */
export function usePostCacheSync() {
    const queryClient = useQueryClient()
    const { activeId } = useAuth()

    useEffect(() => {
        const ids = (collect: (data: unknown) => string[]) => {
            const found = new Set<string>()
            for (const query of queryClient.getQueryCache().getAll()) {
                for (const id of collect(query.state.data)) found.add(id)
            }
            return [...found].slice(0, MAX_POSTS)
        }

        const onPurchased = ({
            postId,
            accountId,
        }: {
            postId: string
            accountId: string | null
        }) => {
            if (accountId !== activeId) return
            void refreshPosts(queryClient, [postId], activeId)
        }
        const onJoined = ({
            channelSlug,
            accountId,
        }: {
            channelSlug: string
            accountId: string | null
        }) => {
            if (accountId !== activeId) return
            void refreshPosts(
                queryClient,
                ids(data => postIdsOfChannel(data, channelSlug)),
                activeId,
            )
        }
        const onPaid = () => {
            void refreshPosts(queryClient, ids(membershipLockedPostIds), activeId)
        }

        eventBus.on('post:purchased', onPurchased)
        eventBus.on('membership:joined', onJoined)
        eventBus.on('payment:succeeded', onPaid)
        return () => {
            eventBus.off('post:purchased', onPurchased)
            eventBus.off('membership:joined', onJoined)
            eventBus.off('payment:succeeded', onPaid)
        }
    }, [queryClient, activeId])
}

export async function refreshPosts(
    queryClient: QueryClient,
    ids: readonly string[],
    accountId: string | null,
) {
    if (ids.length === 0) return
    const fresh = new Map<string, Post>()

    const queue = [...ids]
    async function worker() {
        for (let id = queue.shift(); id; id = queue.shift()) {
            try {
                // B72: without this the re-read carries an `If-None-Match` answered `304`.
                await forgetPostDetailCache(id, accountId)
                const post = await queryClient.fetchQuery({
                    queryKey: postKeys.detail(id, accountId),
                    queryFn: () => postApi.getPost(id, accountId),
                    staleTime: 0,
                })
                // `null` is a post that is gone; removing rows is `usePostActions`' business.
                if (post) fresh.set(id, post)
            } catch {
                // One failed read must not cost the others; that row stays as it was.
            }
        }
    }
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, ids.length) }, worker))
    if (fresh.size === 0) return

    /*
     * The predicate is not an optimisation: `setQueriesData` stamps `dataUpdatedAt` on every entry
     * it touches even when the updater hands the same data back, so without it a purchase would
     * reset the staleness of the whole cache.
     */
    const freshIds = [...fresh.keys()]
    queryClient.setQueriesData(
        { predicate: query => freshIds.some(id => holdsPost(query.state.data, id)) },
        (data: unknown) => replacePosts(data, fresh),
    )
}
