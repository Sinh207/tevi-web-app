'use client'

import { useAuth } from '@features/auth'
import { useTranslation } from '@shared/i18n/use-translation'
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useMemo } from 'react'
import { postApi, postKeys } from '../api/post-api'

/**
 * The creator's collections, and making one.
 *
 * ## It is an infinite query now, and it was not
 *
 * This was a single `useQuery` over the first ten, with a note saying it would become an infinite
 * one "the day a collections **screen** exists to justify one". That day arrived with
 * `/@{slug}/collections`, and both surfaces read the same key, so there is one hook rather than two
 * over one endpoint — a second would be a second cache entry disagreeing with the first about how
 * many collections the account has.
 *
 * **The picker still shows one page.** It does not call `loadMore`, so nothing about it changed:
 * paging inside a dialog inside a dialog was the reason it stayed short, and that reason is
 * unaffected by a screen elsewhere being able to page. `hasMore` is what it says out loud instead.
 *
 * ## Enabled is the caller's, because the two callers differ
 *
 * The picker passes `false` until it is opened — a composer that never opens it fires no request,
 * and the composer is mounted for the whole session. The screen is the request's reason for
 * existing, so it passes `true`.
 */
export function useCollections({ enabled }: { enabled: boolean }) {
    const { activeId } = useAuth()
    const { t } = useTranslation()
    const queryClient = useQueryClient()

    const queryKey = useMemo(() => postKeys.collections(activeId), [activeId])

    const query = useInfiniteQuery({
        queryKey,
        initialPageParam: 1,
        queryFn: ({ pageParam, signal }) =>
            postApi.getCollections({ page: pageParam, accountId: activeId, signal }),
        /*
         * `hasMore` is `Boolean(next)` — the model reads the payload's own link rather than
         * inferring the end from a short page, so a page that happens to be exactly full does not
         * stop the list one page early.
         */
        getNextPageParam: (last, pages) => (last.hasMore ? pages.length + 1 : undefined),
        enabled,
    })

    const collections = useMemo(
        () => query.data?.pages.flatMap(page => page.results) ?? [],
        [query.data],
    )

    const create = useMutation({
        mutationFn: (name: string) => postApi.createCollection(name.trim(), activeId),
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey })
        },
        /** The API's own sentence wins on a 4xx — a duplicate name is its to phrase. */
        meta: { showErrorToast: t('post_collection_create_failed') },
    })

    return {
        collections,
        /**
         * There are more than has been fetched.
         *
         * The picker prints this as a sentence and stops; the screen pages on it. Same fact, two
         * honest readings of it.
         */
        hasMore: query.hasNextPage,
        isLoading: enabled && query.isLoading,
        isError: query.isError,
        isEmpty: !query.isLoading && !query.isError && collections.length === 0,
        refetch: query.refetch,
        isFetchingNextPage: query.isFetchingNextPage,
        loadMore: () => {
            if (query.hasNextPage && !query.isFetchingNextPage) void query.fetchNextPage()
        },
        create: (name: string) => create.mutateAsync(name),
        isCreating: create.isPending,
    }
}
