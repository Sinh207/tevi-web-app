'use client'

import { useMyChannel } from '@features/channel'
import { CollectionDetail } from '@features/post'
import { collectionsHref } from '@features/post/routes'
import { useRouter } from 'next/navigation'

/**
 * The client boundary for `/@{slug}/collections/{id}`.
 *
 * Three facts the screen cannot read for itself, all from `useMyChannel` — which is
 * `features/channel`'s, and that feature imports `features/post`, so the screen would close a
 * barrel cycle by reaching for it. `[slug]/post/[code]/post-detail-screen.tsx` carries the long
 * form of why that is a runtime failure rather than a lint one.
 *
 * - **Ownership**, which decides whether renaming, deleting and unfiling are offered at all. The
 *   endpoint is account-scoped, so a reader looking at somebody else's address is looking at their
 *   own collection either way; the guard is what stops the owner's controls appearing over it.
 * - **Premium**, which exempts the reader from paid interaction on the cards below.
 * - **Where to go once the collection is gone** — back to the list, not `back()`, which on a
 *   delete would return to whatever the reader was looking at before and leave the deleted
 *   collection in their history.
 */
export function CollectionScreen({ slug, collectionId }: { slug: string; collectionId: string }) {
    const router = useRouter()
    const { myChannel, isPremium } = useMyChannel()

    const isOwner = myChannel?.slug != null && myChannel.slug.toLowerCase() === slug.toLowerCase()

    return (
        <CollectionDetail
            collectionId={collectionId}
            isOwner={isOwner}
            isPremiumReader={isPremium}
            onDeleted={() => router.replace(collectionsHref(slug))}
        />
    )
}
