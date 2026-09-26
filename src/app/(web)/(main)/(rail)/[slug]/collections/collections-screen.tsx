'use client'

import { useMyChannel } from '@features/channel'
import { CollectionList } from '@features/post'
import { useTranslation } from '@shared/i18n/use-translation'

/**
 * The client boundary for `/@{slug}/collections`.
 *
 * ## It checks ownership, and that is the whole reason it exists
 *
 * `v1/posts/collections/` is **account-scoped**: it answers with *this bearer's* collections and
 * takes no slug. So the slug in the URL is an address, not a query — and a reader who opens
 * somebody else's `/@them/collections` would otherwise be shown their own list under that person's
 * name, which is the worst of both readings.
 *
 * Until the endpoint can answer for another account, a non-owner is told the screen is not theirs
 * rather than shown a list that is. `useMyChannel` is `features/channel`'s and that feature imports
 * `features/post`, so the check cannot live in the list itself without closing a barrel cycle —
 * `[slug]/post/[code]/post-detail-screen.tsx` carries the long form of why that is a runtime
 * failure rather than a lint one.
 */
export function CollectionsScreen({ slug }: { slug: string }) {
    const { t } = useTranslation()
    const { myChannel } = useMyChannel()

    const isOwner = myChannel?.slug != null && myChannel.slug.toLowerCase() === slug.toLowerCase()

    if (!isOwner) {
        return (
            <p
                data-testid="post-collections-message"
                className="type-dense-default px-6 py-16 text-center text-(--text-subtitle)"
            >
                {t('collections_not_yours')}
            </p>
        )
    }

    return <CollectionList slug={`@${slug}`} />
}
