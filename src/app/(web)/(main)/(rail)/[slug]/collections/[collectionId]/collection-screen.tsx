'use client'

import { CollectionDetail } from '@features/post'
import { collectionsHref } from '@features/post/routes'
import { useRouter } from 'next/navigation'
import { useCollectionOwnership } from '../use-collection-ownership'

/**
 * The client boundary for `/@{slug}/collections/{id}`.
 *
 * Three facts the screen cannot read for itself, all through `useCollectionOwnership` (beside the
 * list's route) — `useMyChannel` is `features/channel`'s, and that feature imports `features/post`,
 * so the screen would close a barrel cycle by reaching for it.
 *
 * - **Ownership**, which decides both what is offered (renaming, deleting, unfiling) and **which
 *   endpoint** reads the collection: the owner's account-scoped `v1`, or the space's public `v3`.
 *   It has a third value, `unknown`, for the moment the reader's own channel is still loading —
 *   answering `viewer` there would send the owner through the public door first.
 * - **Premium**, which exempts the reader from paid interaction on the cards below.
 * - **Where to go once the collection is gone** — back to the list, not `back()`, which on a
 *   delete would return to whatever the reader was looking at before and leave the deleted
 *   collection in their history.
 */
export function CollectionScreen({ slug, collectionId }: { slug: string; collectionId: string }) {
    const router = useRouter()
    const { ownership, channelId, isPremium } = useCollectionOwnership(slug)

    return (
        <CollectionDetail
            slug={slug}
            collectionId={collectionId}
            ownership={ownership}
            ownerChannelId={channelId}
            isPremiumReader={isPremium}
            onDeleted={() => router.replace(collectionsHref(slug))}
        />
    )
}
