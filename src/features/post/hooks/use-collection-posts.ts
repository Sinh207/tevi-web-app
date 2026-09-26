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
 * ## Renaming and deleting invalidate the **list**, not just this screen
 *
 * `postKeys.collections` is what the composer's picker reads. A rename that refreshed only this
 * page would leave the picker offering the old name until something else happened to refetch it,
 * and a delete would leave it offering a collection that is gone — which the picker would then file
 * a post into.
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
    { onDeleted }: { onDeleted?: () => void } = {},
): UseCollectionResult {
    const { activeId, isAuthenticated } = useAuth()
    const { t } = useTranslation()
    const queryClient = useQueryClient()

    const detailKey = useMemo(
        () => postKeys.collection(collectionId, activeId),
        [collectionId, activeId],
    )
    const postsKey = useMemo(
        () => postKeys.collectionPosts(collectionId, activeId),
        [collectionId, activeId],
    )
    const listKey = useMemo(() => postKeys.collections(activeId), [activeId])

    const detail = useQuery({
        queryKey: detailKey,
        queryFn: ({ signal }) => postApi.getCollection(collectionId, activeId, signal),
        enabled: isAuthenticated && Boolean(collectionId),
    })

    const posts = useInfiniteQuery({
        queryKey: postsKey,
        initialPageParam: COLLECTION_POSTS_FIRST_PAGE as PageCursor | null,
        queryFn: ({ pageParam, signal }) =>
            postApi.getCollectionPosts({
                collectionId,
                params: pageParam ?? COLLECTION_POSTS_FIRST_PAGE,
                accountId: activeId,
                signal,
            }),
        getNextPageParam: (last, _pages, lastParam) => nextCollectionPostsCursor(last, lastParam),
        enabled: isAuthenticated && Boolean(collectionId),
    })

    const rows = useMemo(() => posts.data?.pages.flatMap(page => page.results) ?? [], [posts.data])

    /** Everything this screen writes touches the picker's list too. */
    const invalidateAll = () => {
        void queryClient.invalidateQueries({ queryKey: listKey })
        void queryClient.invalidateQueries({ queryKey: detailKey })
        void queryClient.invalidateQueries({ queryKey: postsKey })
    }

    const renameMutation = useMutation({
        mutationFn: (name: string) => postApi.renameCollection(collectionId, name, activeId),
        onSuccess: () => {
            toast.success(t('collection_renamed'))
            invalidateAll()
        },
        meta: { showErrorToast: t('collection_rename_failed') },
    })

    const removeMutation = useMutation({
        mutationFn: () => postApi.deleteCollection(collectionId, activeId),
        onSuccess: () => {
            toast.success(t('collection_deleted'))
            /*
             * The detail query is **removed**, not invalidated: the collection is gone, so a
             * refetch would be a request for a 404 on the way out of a screen that is already
             * navigating away.
             */
            queryClient.removeQueries({ queryKey: detailKey })
            queryClient.removeQueries({ queryKey: postsKey })
            void queryClient.invalidateQueries({ queryKey: listKey })
            onDeleted?.()
        },
        meta: { showErrorToast: t('collection_delete_failed') },
    })

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
        isLoading: detail.isLoading || posts.isLoading,
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

        rename: name => renameMutation.mutate(name),
        isRenaming: renameMutation.isPending,
        remove: () => removeMutation.mutate(),
        isRemoving: removeMutation.isPending,
        unfile: postId => unfileMutation.mutate(postId),
    }
}
