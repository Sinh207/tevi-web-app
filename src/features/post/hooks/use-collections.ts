'use client'

import { useAuth } from '@features/auth'
import { useTranslation } from '@shared/i18n/use-translation'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { postApi, postKeys } from '../api/post-api'

/**
 * The creator's collections, and making one.
 *
 * ## One page, not an infinite list
 *
 * The picker is a short list inside a composer, and legacy asks for ten. A creator with more than
 * ten collections is a real case and this shows the first ten of them — which is a limitation worth
 * stating rather than hiding behind a scroll that never loads more. It becomes an infinite query the
 * day a collections **screen** exists to justify one; here it would be paging inside a dialog inside
 * a dialog.
 *
 * ## Enabled only while the picker is open
 *
 * The same bargain `useChildReplies` strikes: a composer that never opens the picker fires no
 * request, and the composer is mounted for the whole session.
 */
export function useCollections({ enabled }: { enabled: boolean }) {
    const { activeId } = useAuth()
    const { t } = useTranslation()
    const queryClient = useQueryClient()

    const query = useQuery({
        queryKey: postKeys.collections(activeId),
        queryFn: ({ signal }) => postApi.getCollections({ accountId: activeId, signal }),
        enabled,
    })

    const create = useMutation({
        mutationFn: (name: string) => postApi.createCollection(name.trim(), activeId),
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: postKeys.collections(activeId) })
        },
        /** The API's own sentence wins on a 4xx — a duplicate name is its to phrase. */
        meta: { showErrorToast: t('post_collection_create_failed') },
    })

    return {
        collections: query.data?.results ?? [],
        /** There are more than this page holds — said out loud rather than paged over. */
        hasMore: query.data?.hasMore ?? false,
        isLoading: enabled && query.isLoading,
        isError: query.isError,
        refetch: query.refetch,
        create: (name: string) => create.mutateAsync(name),
        isCreating: create.isPending,
    }
}
