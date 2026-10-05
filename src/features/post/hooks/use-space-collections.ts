'use client'

import { useAuth } from '@features/auth'
import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import type { PostCollection } from '../api/collection-types'
import { postApi, postKeys } from '../api/post-api'
import { useCollections } from './use-collections'

/**
 * A space's collections, for the chip row on its Posts tab — legacy's `useCollectionCreator` /
 * `useCollectionViewer`, which are one hook here because they are one row.
 *
 * ## Two endpoints, chosen by who is looking
 *
 * The **owner** reads `v1/posts/collections/` through `useCollections` — the very query the
 * collections screen and the composer's picker read, so a collection made in the composer is a chip
 * the moment the list refetches, with no event between them. Everybody **else** reads the space's
 * public half, `v3/channel/channels/{slug}/post-collections/`. Legacy splits it the same way.
 *
 * Both hooks are always called and one of them is disabled — hooks cannot be called conditionally,
 * and a disabled query costs a subscription, not a request.
 *
 * ## A guest asks too
 *
 * Legacy's viewer row fetches for everybody and gates the **press** (`RequireAuth` around each
 * chip), and so does this: a signed-out reader sees what the space has filed and is asked to sign
 * in only when they open one. Every visitor carries an anonymous session, which is the bearer this
 * goes out with.
 *
 * First page only, as legacy's row — ten chips is a row; the owner has *Manage collections* for the
 * rest.
 */
export function useSpaceCollections({ slug, isOwner }: { slug: string; isOwner: boolean }): {
    collections: PostCollection[]
    isLoading: boolean
} {
    const { activeId } = useAuth()

    const own = useCollections({ enabled: isOwner })

    const theirs = useQuery({
        queryKey: postKeys.spaceCollections(slug, activeId),
        queryFn: ({ signal }) => postApi.getSpaceCollections({ slug, accountId: activeId, signal }),
        enabled: !isOwner && Boolean(slug),
    })

    const viewerRows = useMemo(() => theirs.data?.results ?? [], [theirs.data])

    return isOwner
        ? { collections: own.collections, isLoading: own.isLoading }
        : { collections: viewerRows, isLoading: theirs.isLoading }
}
