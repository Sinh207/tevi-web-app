'use client'

import { useAuth } from '@features/auth'
import { useQuery } from '@tanstack/react-query'
import { postApi, postKeys } from '../api/post-api'
import type { Post } from '../api/types'

/**
 * One post, as **this reader**.
 *
 * ## The server's copy is `placeholderData`, never `initialData`
 *
 * The detail route fetches the post during the render so a shared link paints something and a
 * link-preview scraper has content to read (`api/post-server-api.ts`). That body is the
 * **anonymous** view: no bearer exists on the server, so `is_bookmark`, `user_reaction`,
 * `need_unlock_package` and `can_reply` are all answered for nobody.
 *
 * `initialData` would write it into the cache under *this account's* key, where it would be
 * treated as this reader's own copy — a post they had unlocked would render locked, and
 * `staleTime` would keep it that way. `placeholderData` shows the same body without storing it, so
 * the query still fetches immediately and the cache only ever holds a real answer.
 *
 * `null` is a legitimate resolution, not an error: `postApi.getPost` swallows a 404 so that a post
 * deleted between the feed rendering a card and the reader tapping it is an *answer* the page can
 * phrase, rather than an error boundary.
 */
export function usePostDetail(identifier: string, serverPost: Post | null) {
    const { activeId } = useAuth()

    const query = useQuery({
        queryKey: postKeys.detail(identifier, activeId),
        queryFn: () => postApi.getPost(identifier, activeId),
        placeholderData: serverPost ?? undefined,
    })

    return {
        post: query.data ?? null,
        /*
         * Only a load with nothing to show. With a server body in hand the page is never blank, so
         * a skeleton over it would be a flash of *worse* than what is already on screen.
         */
        isLoading: query.isLoading && !serverPost,
        isError: query.isError,
        refetch: query.refetch,
        /** Resolved, and the post is not there — a tombstone, not a failure. */
        isMissing: query.isSuccess && query.data === null,
    }
}
