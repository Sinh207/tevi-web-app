'use client'

import { CollectionCreateButton } from '@features/post'
import { useCollectionOwnership } from './use-collection-ownership'

/**
 * The `+` in `/@{slug}/collections`' bar, for the owner only — handed into `PageBackBar`'s `actions`
 * slot by the server page, the way `/bookmarks` hands in its own. The button itself stands down at
 * the ten-collection limit; this decides only whether it is the reader's to press.
 */
export function CollectionsBarActions({ slug }: { slug: string }) {
    const { ownership } = useCollectionOwnership(slug)
    return ownership === 'owner' ? <CollectionCreateButton /> : null
}
