'use client'

import { useAuth } from '@features/auth'
import type { PageCursor } from '@shared/lib/api/page-cursor'
import { infiniteQueryOptions, useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import type { PostCollection } from '../api/collection-types'
import { postApi, postKeys } from '../api/post-api'
import type { Post } from '../api/types'
import { COLLECTION_POSTS_FIRST_PAGE, nextCollectionPostsCursor } from '../lib/collection-page'
import { useCollectionWrites } from './use-collection-writes'

/**
 * Who is looking at a collection, which decides **which endpoint** reads it.
 *
 * - `owner` — `v1/posts/collections/{id}/…`, the account-scoped half every write invalidates.
 * - `viewer` — `v3/channel/channels/{slug}/post-collections/{id}/…`, the half addressed by the
 *   space, which is the only one that can answer for an account that is not the bearer's.
 * - `unknown` — the reader's own channel has not loaded yet, so neither is asked. Guessing `viewer`
 *   would send the owner a request for their own collection through the public door and then a
 *   second one through theirs, with the screen redrawing between the two.
 *
 * Legacy makes the same split (`useCollectionDetail`: `isMyChannel ? PostModel… : ChannelModel…`).
 */
export type CollectionOwnership = 'owner' | 'viewer' | 'unknown'

/**
 * One collection: its own row, its posts, and the three things an owner can do to it.
 *
 * ## Two queries, not one
 *
 * The collection's name comes from `collections/{id}/`, its posts from `collections/{id}/posts/`.
 * Folding the name out of the first page of posts would work until a collection is **empty** —
 * which is the state a reader most needs a title for, since there is nothing else on the screen to
 * say where they are. A collection is also linkable, so a reader can arrive with neither in cache.
 *
 * ## Renaming and deleting are `useCollectionWrites`'
 *
 * The list's rows offer the same two, so the mutations live there and this composes them — that
 * hook says why both reach the list's key. Taking posts out is the *Edit collection* dialog's, as in
 * legacy — not a control on each card.
 */
export interface UseCollectionResult {
    collection: PostCollection | null
    posts: Post[]
    /** What the server says the collection holds, which may exceed what has been fetched. */
    total: number
    isLoading: boolean
    isError: boolean
    /** Loaded, no failure, and nothing filed in it. */
    isEmpty: boolean
    /** The collection itself could not be read — a wrong id, or somebody else's. */
    isMissing: boolean
    /** No account, so neither query ran. Distinct from an empty collection. */
    isSignedOut: boolean
    refetch: () => void
    hasNextPage: boolean
    isFetchingNextPage: boolean
    loadMore: () => void

    rename: (name: string) => void
    isRenaming: boolean
    remove: () => void
    isRemoving: boolean
}

export function useCollection(
    collectionId: string,
    {
        slug,
        ownership,
        onDeleted,
    }: {
        /** The space the URL is under — the viewer half is addressed by it. */
        slug: string
        ownership: CollectionOwnership
        onDeleted?: () => void
    },
): UseCollectionResult {
    const { activeId, isAuthenticated } = useAuth()

    const isOwner = ownership === 'owner'

    const detailKey = useMemo(
        () =>
            isOwner
                ? postKeys.collection(collectionId, activeId)
                : postKeys.spaceCollection(slug, collectionId, activeId),
        [isOwner, slug, collectionId, activeId],
    )

    /*
     * A signed-in account only, on both halves — legacy's `initData` asks nothing without one, and
     * every row carries the reader's unlock state, which an anonymous session has none of.
     */
    const enabled = isAuthenticated && Boolean(collectionId) && ownership !== 'unknown'

    const detail = useQuery({
        queryKey: detailKey,
        queryFn: ({ signal }) =>
            isOwner
                ? postApi.getCollection(collectionId, activeId, signal)
                : postApi.getSpaceCollection(slug, collectionId, activeId, signal),
        enabled,
    })

    const posts = useInfiniteQuery({
        ...collectionPostsOptions({ collectionId, slug, isOwner, accountId: activeId }),
        enabled,
    })

    const rows = useMemo(() => posts.data?.pages.flatMap(page => page.results) ?? [], [posts.data])

    const writes = useCollectionWrites(collectionId, { onDeleted })

    return {
        collection: detail.data ?? null,
        posts: rows,
        total: posts.data?.pages[0]?.count ?? 0,
        /* `unknown` is loading too — no request yet, but no answer either. */
        isLoading:
            (isAuthenticated && ownership === 'unknown') || detail.isLoading || posts.isLoading,
        isError: posts.isError,
        isEmpty: !posts.isLoading && !posts.isError && rows.length === 0,
        /*
         * `data === null` is the parse refusing a body, which is how a wrong id arrives — the model
         * normalises rather than throwing, so an error state would never be reached for it.
         */
        isMissing: detail.isError || (!detail.isLoading && detail.data === null),
        isSignedOut: !isAuthenticated,
        refetch: () => {
            void detail.refetch()
            void posts.refetch()
        },
        hasNextPage: posts.hasNextPage,
        isFetchingNextPage: posts.isFetchingNextPage,
        loadMore: () => {
            if (posts.hasNextPage && !posts.isFetchingNextPage) void posts.fetchNextPage()
        },

        rename: writes.rename,
        isRenaming: writes.isRenaming,
        remove: writes.remove,
        isRemoving: writes.isRemoving,
    }
}

/**
 * The query behind a collection's posts — **one definition**, because two surfaces read it: the
 * collection's screen and the owner's *Edit collection* dialog, which lists the same posts to take
 * some out. The same key and the same `queryFn` mean one cache entry, so a removal the dialog makes
 * is the screen's next render too.
 */
export function collectionPostsOptions({
    collectionId,
    slug,
    isOwner,
    accountId,
}: {
    collectionId: string
    slug: string
    isOwner: boolean
    accountId: string | null
}) {
    return infiniteQueryOptions({
        queryKey: isOwner
            ? postKeys.collectionPosts(collectionId, accountId)
            : postKeys.spaceCollectionPosts(slug, collectionId, accountId),
        initialPageParam: COLLECTION_POSTS_FIRST_PAGE as PageCursor | null,
        queryFn: ({ pageParam, signal }) => {
            const params = pageParam ?? COLLECTION_POSTS_FIRST_PAGE
            return isOwner
                ? postApi.getCollectionPosts({ collectionId, params, accountId, signal })
                : postApi.getSpaceCollectionPosts({ slug, collectionId, params, accountId, signal })
        },
        getNextPageParam: (last, _pages, lastParam) => nextCollectionPostsCursor(last, lastParam),
    })
}
