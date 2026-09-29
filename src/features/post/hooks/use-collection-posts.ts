'use client'

import { useAuth } from '@features/auth'
import { useTranslation } from '@shared/i18n/use-translation'
import type { PageCursor } from '@shared/lib/api/page-cursor'
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo } from 'react'
import { toast } from 'sonner'
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
 * hook says why both reach the list's key. Unfiling a post is this screen's alone.
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
    /** Unfile one post. It stays on its space — see `removePostsFromCollection`. */
    unfile: (postId: string) => void
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
    const { t } = useTranslation()
    const queryClient = useQueryClient()

    const isOwner = ownership === 'owner'

    const detailKey = useMemo(
        () =>
            isOwner
                ? postKeys.collection(collectionId, activeId)
                : postKeys.spaceCollection(slug, collectionId, activeId),
        [isOwner, slug, collectionId, activeId],
    )
    const postsKey = useMemo(
        () =>
            isOwner
                ? postKeys.collectionPosts(collectionId, activeId)
                : postKeys.spaceCollectionPosts(slug, collectionId, activeId),
        [isOwner, slug, collectionId, activeId],
    )
    const listKey = useMemo(() => postKeys.collections(activeId), [activeId])

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
        queryKey: postsKey,
        initialPageParam: COLLECTION_POSTS_FIRST_PAGE as PageCursor | null,
        queryFn: ({ pageParam, signal }) => {
            const params = pageParam ?? COLLECTION_POSTS_FIRST_PAGE
            return isOwner
                ? postApi.getCollectionPosts({ collectionId, params, accountId: activeId, signal })
                : postApi.getSpaceCollectionPosts({
                      slug,
                      collectionId,
                      params,
                      accountId: activeId,
                      signal,
                  })
        },
        getNextPageParam: (last, _pages, lastParam) => nextCollectionPostsCursor(last, lastParam),
        enabled,
    })

    const rows = useMemo(() => posts.data?.pages.flatMap(page => page.results) ?? [], [posts.data])

    const writes = useCollectionWrites(collectionId, { onDeleted })

    const unfileMutation = useMutation({
        mutationFn: (postId: string) =>
            postApi.removePostsFromCollection(collectionId, [postId], activeId),
        onSuccess: () => {
            toast.success(t('collection_post_removed'))
            void queryClient.invalidateQueries({ queryKey: postsKey })
            // The count on the row the reader came from moved too.
            void queryClient.invalidateQueries({ queryKey: listKey })
            void queryClient.invalidateQueries({ queryKey: detailKey })
        },
        meta: { showErrorToast: t('collection_post_remove_failed') },
    })

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
        unfile: postId => unfileMutation.mutate(postId),
    }
}
