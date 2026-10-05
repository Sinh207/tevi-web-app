'use client'

import { CollectionCreateButton, CollectionList, CollectionScreenHeader } from '@features/post'
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

    const header = (
        <CollectionScreenHeader
            title={t('collections_header')}
            actions={ownership === 'owner' ? <CollectionCreateButton /> : null}
            testId="post-collections-header"
        />
    )

    /*
     * The bar only while the reader's own channel is still loading — deciding then would flash
     * "not yours" at the owner for the length of one request.
     */
    if (ownership === 'unknown') return header

    if (ownership !== 'owner') {
        return (
            <>
                {header}
                <p
                    data-testid="post-collections-message"
                    className="type-dense-default bg-(--background-surface) px-4 py-[50px] text-center text-(--text-subtitle) md:mt-2.5 md:rounded-(--radius-xl)"
                >
                    {t('collections_not_yours')}
                </p>
            </>
        )
    }

    return (
        <>
            {header}
            <CollectionList slug={`@${slug}`} channelId={channelId} />
        </>
    )
}
