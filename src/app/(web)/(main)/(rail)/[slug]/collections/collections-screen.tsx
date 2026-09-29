'use client'

import { CollectionList } from '@features/post'
import { useTranslation } from '@shared/i18n/use-translation'
import { useCollectionOwnership } from './use-collection-ownership'

/**
 * The client boundary for `/@{slug}/collections`.
 *
 * ## It checks ownership, and that is the whole reason it exists
 *
 * This is the **owner's** screen — the place a creator manages their collections — and legacy is
 * owner-only too (`collectionList` sends anybody else to `/403`). A visitor meets a space's
 * collections on its Posts tab, as a row of chips, and each chip opens the collection itself,
 * which *does* answer for them (`v3/channel/channels/{slug}/post-collections/{id}/`).
 *
 * The list below is `v1/posts/collections/`, which is **account-scoped**: it answers with *this
 * bearer's* collections and takes no slug. So without this check a reader opening somebody else's
 * `/@them/collections` would be shown their own list under that person's name.
 *
 * The check is `useCollectionOwnership`, beside this file, for the barrel-cycle reason it gives.
 */
export function CollectionsScreen({ slug }: { slug: string }) {
    const { t } = useTranslation()
    const { ownership, channelId } = useCollectionOwnership(slug)

    /*
     * Nothing while the reader's own channel is still loading — deciding then would flash "not
     * yours" at the owner for the length of one request.
     */
    if (ownership === 'unknown') return null

    if (ownership !== 'owner') {
        return (
            <p
                data-testid="post-collections-message"
                className="type-dense-default px-6 py-16 text-center text-(--text-subtitle)"
            >
                {t('collections_not_yours')}
            </p>
        )
    }

    return <CollectionList slug={`@${slug}`} channelId={channelId} />
}
