'use client'

import { useAuth } from '@features/auth'
import { useTranslation } from '@shared/i18n/use-translation'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { postApi, postKeys } from '../api/post-api'

/**
 * Renaming, deleting and taking posts out of **one** collection — the owner's two writes on it, wherever it is drawn.
 *
 * Its own hook because two places offer them: the collection's own screen and each row of the
 * list (legacy's `CollectionItem` menu is the same four items on both). `useCollection` composes it
 * rather than carrying a second copy of the same mutations.
 *
 * ## Both invalidate the **list**, not just the collection
 *
 * `postKeys.collections` is what the composer's picker and the space's chip row read. A rename that
 * refreshed only the collection would leave both offering the old name, and a delete would leave
 * them offering a collection that is gone — which the picker would then file a post into.
 */
export function useCollectionWrites(
    collectionId: string,
    { onDeleted }: { onDeleted?: () => void } = {},
) {
    const { activeId } = useAuth()
    const { t } = useTranslation()
    const queryClient = useQueryClient()

    const listKey = postKeys.collections(activeId)
    const detailKey = postKeys.collection(collectionId, activeId)
    const postsKey = postKeys.collectionPosts(collectionId, activeId)

    const rename = useMutation({
        mutationFn: (name: string) => postApi.renameCollection(collectionId, name, activeId),
        onSuccess: () => {
            toast.success(t('collection_renamed'))
            void queryClient.invalidateQueries({ queryKey: listKey })
            void queryClient.invalidateQueries({ queryKey: detailKey })
        },
        /** The API's own sentence wins on a 4xx — a duplicate name is its to phrase. */
        meta: { showErrorToast: t('collection_rename_failed') },
    })

    const remove = useMutation({
        mutationFn: () => postApi.deleteCollection(collectionId, activeId),
        onSuccess: () => {
            toast.success(t('collection_deleted'))
            /*
             * The collection's own queries are **removed**, not invalidated: it is gone, so a
             * refetch would be a request for a 404 — on the way out of a screen that is already
             * navigating away, or for a row that is about to leave the list.
             */
            queryClient.removeQueries({ queryKey: detailKey })
            queryClient.removeQueries({ queryKey: postsKey })
            void queryClient.invalidateQueries({ queryKey: listKey })
            onDeleted?.()
        },
        meta: { showErrorToast: t('collection_delete_failed') },
    })

    /**
     * Take posts out — legacy's `deletePostsInCollection`, which *Edit collection* sends for every
     * post marked on *Done*. The posts stay on their space (`removePostsFromCollection` says why that
     * is safe to offer behind no confirmation).
     */
    const removePosts = useMutation({
        mutationFn: (postIds: string[]) =>
            postApi.removePostsFromCollection(collectionId, postIds, activeId),
        onSuccess: () => {
            toast.success(t('collection_post_removed'))
            void queryClient.invalidateQueries({ queryKey: postsKey })
            // The count on the card, and on the list's card one screen back, moved too.
            void queryClient.invalidateQueries({ queryKey: detailKey })
            void queryClient.invalidateQueries({ queryKey: listKey })
        },
        meta: { showErrorToast: t('collection_post_remove_failed') },
    })

    return {
        rename: (name: string) => rename.mutate(name),
        isRenaming: rename.isPending,
        remove: () => remove.mutate(),
        isRemoving: remove.isPending,
        removePosts: (postIds: string[]) => removePosts.mutate(postIds),
        isRemovingPosts: removePosts.isPending,
    }
}
