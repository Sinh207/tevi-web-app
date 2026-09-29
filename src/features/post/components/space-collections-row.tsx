'use client'

import { useAuth, useRequireAuth } from '@features/auth'
import { ScrollRow } from '@shared/components/scroll-row'
import { useTranslation } from '@shared/i18n/use-translation'
import { subTestId } from '@shared/lib/test-id'
import { Icon } from '@shared/ui/icon'
import Link from 'next/link'
import { useSpaceCollections } from '../hooks/use-space-collections'
import { collectionHref, collectionsHref } from '../routes'

/**
 * The row of collections at the top of a space's Posts tab — legacy's `CollectionsTabPost`, both of
 * them (`channel/components/{creator,viewer}/…/tabs/post/common/collections`).
 *
 * - The **owner** gets *Manage collections* first, then a chip per collection. The button is there
 *   with no collections too: it is the way to the screen where one is made.
 * - A **visitor** gets the chips only, and nothing at all when the space has filed nothing — an
 *   empty row would be a strip of page with no content.
 *
 * A chip is a real `<Link>`, so it is middle-clickable. A guest's press is caught before it
 * navigates and turned into the sign-in dialog instead, which is legacy's `RequireAuth` around the
 * chip: the collection screen asks nothing without an account, so landing there signed out would
 * be a screen that says "sign in" one navigation later than it could have.
 *
 * A **scrolling row**, not a carousel (`docs/DESIGN_SYSTEM.md` §10) — legacy's Swiper in free mode
 * was a row too.
 */
export function SpaceCollectionsRow({
    slug,
    isOwner,
    testId = 'post-space-collections',
}: {
    /** The space's slug, bare. */
    slug: string
    isOwner: boolean
    testId?: string
}) {
    const { t } = useTranslation()
    const { isAuthenticated } = useAuth()
    const requireAuth = useRequireAuth()
    const { collections } = useSpaceCollections({ slug, isOwner })

    if (!isOwner && collections.length === 0) return null

    return (
        <ScrollRow
            count={collections.length}
            label={t('collections_row_label')}
            /* The row bleeds to the card's edge, and its padding is what lines the ends up with the posts. */
            trackClassName="gap-1 px-3 scroll-px-3 md:px-6 md:scroll-px-6"
            className="-mx-3 md:-mx-6"
        >
            {isOwner ? (
                <li className="flex-none snap-start">
                    <Link
                        href={collectionsHref(slug)}
                        data-testid={subTestId(testId, 'trigger')}
                        className={CHIP}
                    >
                        <Icon name="gear" size={20} className="flex-none text-(--icon-default)" />
                        {t('collections_title')}
                    </Link>
                </li>
            ) : null}
            {collections.map(collection => (
                <li key={collection.id} className="flex-none snap-start">
                    <Link
                        href={collectionHref(slug, collection.id)}
                        data-testid={subTestId(testId, 'item')}
                        data-option-value={collection.id}
                        onClick={event => {
                            if (isAuthenticated) return
                            event.preventDefault()
                            requireAuth(() => {})()
                        }}
                        className={CHIP}
                    >
                        <Icon
                            name="history-rectangle-play"
                            size={20}
                            className="flex-none text-(--icon-secondary)"
                        />
                        <span className="max-w-[200px] truncate">{collection.name}</span>
                    </Link>
                </li>
            ))}
        </ScrollRow>
    )
}

/** Legacy's chip: 36 tall, 4px corners, the segment fill, a 20px glyph and 14/500 text. */
const CHIP =
    'type-dense-emphasis flex h-9 items-center gap-2 whitespace-nowrap rounded-(--radius-sm) bg-(--background-segment) px-3 text-(--text-title) transition-opacity hover:opacity-80'
