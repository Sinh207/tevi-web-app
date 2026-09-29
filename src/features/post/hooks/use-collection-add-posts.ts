'use client'

import { useAuth } from '@features/auth'
import { useTranslation } from '@shared/i18n/use-translation'
import type { PageCursor } from '@shared/lib/api/page-cursor'
import {
    keepPreviousData,
    useInfiniteQuery,
    useMutation,
    useQueryClient,
} from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { type CollectionCandidateType, postApi, postKeys } from '../api/post-api'
import { COLLECTION_POSTS_FIRST_PAGE, nextCollectionPostsCursor } from '../lib/collection-page'

/** The same settle time as the conversation search — long enough that a word is one request. */
const SEARCH_DEBOUNCE_MS = 400

/**
 * *Add posts*' list: the owner's posts that are not in this collection, by filter and term.
 *
 * ## The term is debounced before it reaches the key
 *
 * The field shows every keystroke; the request sees the settled term, as `useConversationSearch`
 * does. `keepPreviousData` keeps the last list up while the next one loads, so a word typed is not
 * ten skeleton flashes — legacy clears its arrays on every change, which is exactly that flash.
 *
 * Each filter is its own cache entry, so switching back to a tab shows the pages it already had.
 * Legacy holds four arrays for the same reason.
 */
export function useCollectionCandidates({
    channelId,
    collectionId,
    type,
    search,
}: {
    /** The owner's own channel. `null` until it is known, and nothing is asked until then. */
    channelId: string | null
    collectionId: string
    type: CollectionCandidateType
    /** What the field holds, unsettled. */
    search: string
}) {
    const { activeId, isAuthenticated } = useAuth()
    const [q, setQ] = useState(search.trim())

    useEffect(() => {
        const next = search.trim()
        // Clearing applies at once — there is no request to save by waiting.
        if (next === '') {
            setQ('')
            return
        }
        const timer = setTimeout(() => setQ(next), SEARCH_DEBOUNCE_MS)
        return () => clearTimeout(timer)
    }, [search])

    const query = useInfiniteQuery({
        queryKey: postKeys.collectionCandidates(collectionId, type, q, activeId),
        initialPageParam: COLLECTION_POSTS_FIRST_PAGE as PageCursor | null,
        queryFn: ({ pageParam, signal }) =>
            postApi.getCollectionCandidates({
                channelId: channelId ?? '',
                collectionId,
                type,
                q,
                params: pageParam ?? COLLECTION_POSTS_FIRST_PAGE,
                accountId: activeId,
                signal,
            }),
        getNextPageParam: (last, _pages, lastParam) => nextCollectionPostsCursor(last, lastParam),
        placeholderData: keepPreviousData,
        enabled: isAuthenticated && Boolean(channelId) && Boolean(collectionId),
    })

    const posts = useMemo(() => query.data?.pages.flatMap(page => page.results) ?? [], [query.data])

    return {
        posts,
        /* The first load only — a refetch under a new term keeps the previous rows up. */
        isLoading: query.isLoading,
        isError: query.isError,
        isEmpty: !query.isLoading && !query.isError && posts.length === 0,
        refetch: query.refetch,
        hasNextPage: query.hasNextPage,
        isFetchingNextPage: query.isFetchingNextPage,
        loadMore: () => {
            if (query.hasNextPage && !query.isFetchingNextPage) void query.fetchNextPage()
        },
    }
}

/**
 * File the picked posts into the collection — one request, `collections/{id}/add-posts/`.
 *
 * Invalidates the collection's posts and row (its count moved), the owner's list (the same count,
 * one screen back) and every candidate list under this collection — a post just filed must stop
 * being offered, and `ignore_collection_id` is what does that, on the next read.
 */
export function useAddPostsToCollection(
    collectionId: string,
    { onAdded }: { onAdded?: () => void } = {},
) {
    const { activeId } = useAuth()
    const { t } = useTranslation()
    const queryClient = useQueryClient()

    const mutation = useMutation({
        mutationFn: (postIds: string[]) =>
            postApi.addPostsToCollection(collectionId, postIds, activeId),
        onSuccess: () => {
            toast.success(t('collection_add_succeeded'))
            void queryClient.invalidateQueries({
                queryKey: postKeys.collectionPosts(collectionId, activeId),
            })
            void queryClient.invalidateQueries({
                queryKey: postKeys.collection(collectionId, activeId),
            })
            void queryClient.invalidateQueries({ queryKey: postKeys.collections(activeId) })
            void queryClient.invalidateQueries({
                queryKey: [...postKeys.all, 'collection-candidates', collectionId],
            })
            onAdded?.()
        },
        /** The API's own sentence wins on a 4xx (`docs/API_ERRORS.md`); this is the fallback. */
        meta: { showErrorToast: t('collection_add_failed') },
    })

    return {
        add: (postIds: string[]) => mutation.mutate(postIds),
        isAdding: mutation.isPending,
    }
}
