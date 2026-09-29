'use client'

import { useInView } from '@shared/hooks/use-in-view'
import { useTranslation } from '@shared/i18n/use-translation'
import { subTestId } from '@shared/lib/test-id'
import { Button } from '@shared/ui/button'
import Image from 'next/image'
import { useEffect, useState } from 'react'
import { useCollections } from '../hooks/use-collections'
import { COLLECTION_ART } from '../lib/illustrations'
import { collectionHref } from '../routes'
import { CollectionCard, CollectionCardSkeleton } from './collection-card'
import { CollectionCreateDialog } from './collection-create'
import { CollectionOwnerMenu } from './collection-owner-menu'

/**
 * `/@{slug}/collections` — the creator's collections, as legacy's `collectionList` draws them: one
 * `CollectionCard` each, 12px apart with 12px around them below `md`, and 24px apart edge to edge
 * from it (legacy: `gap: { xs: 12, md: 24 }`, `padding: { xs: 12, md: 0 }`).
 *
 * ## Cards on the page colour, not a painted screen
 *
 * `docs/DESIGN_SYSTEM.md` §6's one exception: plain surface cards floating in their column, where
 * the gaps between them *are* the separation — painting the screen would dissolve them. Legacy's
 * page is `#f4f4f4` under white cards, which is exactly that.
 *
 * ## No render window
 *
 * A card is a name, a date, a count and a menu trigger — a hundred of them is less DOM than four
 * `PostCard`s, which is what `useRenderWindow` exists for. The collection's own screen, which draws
 * real posts, does window.
 *
 * ## It reads the same query the composer's picker does
 *
 * One key, one cache entry. A collection created in the composer appears here without this screen
 * knowing the composer exists, and a rename here reaches the picker the same way.
 */
export function CollectionList({
    slug,
    channelId,
    testId = 'post-collections',
}: {
    /** The space the URL is under — the cards link within it. */
    slug: string
    /** The owner's own channel — each card's *Add posts* searches it. */
    channelId: string | null
    testId?: string
}) {
    const { t } = useTranslation()
    const {
        collections,
        isLoading,
        isError,
        isEmpty,
        refetch,
        hasMore,
        isFetchingNextPage,
        loadMore,
    } = useCollections({ enabled: true })
    const [creating, setCreating] = useState(false)

    const [sentinelRef, sentinelInView] = useInView<HTMLDivElement>({
        enabled: hasMore && !isFetchingNextPage,
    })

    useEffect(() => {
        if (sentinelInView) loadMore()
    }, [sentinelInView, loadMore])

    if (isLoading) {
        return (
            <div
                data-testid={subTestId(testId, 'list')}
                aria-busy="true"
                className="flex flex-col gap-px md:pt-2.5"
            >
                {Array.from({ length: 4 }, (_, index) => (
                    // biome-ignore lint/suspicious/noArrayIndexKey: placeholders have no identity but their position.
                    <CollectionCardSkeleton key={index} />
                ))}
            </div>
        )
    }

    if (isError) {
        return (
            <div
                data-testid={subTestId(testId, 'message')}
                className="flex flex-col items-center gap-3 bg-(--background-surface) px-4 py-[50px] text-center md:mt-2.5 md:rounded-(--radius-xl)"
            >
                <p className="type-body-strong text-(--text-title)">{t('collections_error')}</p>
                <Button
                    variant="secondary"
                    size="medium"
                    onClick={() => void refetch()}
                    data-testid={subTestId(testId, 'retry')}
                >
                    {t('common_retry')}
                </Button>
            </div>
        )
    }

    if (isEmpty) {
        /* Legacy's empty card: 50px 16px on the surface, its illustration, a title, a line, a button. */
        return (
            <div
                data-testid={subTestId(testId, 'empty')}
                className="flex flex-col items-center gap-2.5 bg-(--background-surface) px-4 py-[50px] text-center md:mt-2.5 md:rounded-(--radius-xl)"
            >
                <Image
                    src={COLLECTION_ART.empty.src}
                    alt=""
                    width={COLLECTION_ART.empty.width}
                    height={COLLECTION_ART.empty.height}
                />
                <p className="type-body-strong text-(--text-title)">
                    {t('collection_empty_owner')}
                </p>
                <p className="type-dense-default max-w-[400px] text-(--text-body)">
                    {t('collections_empty_body')}
                </p>
                <Button
                    variant="primary"
                    size="medium"
                    className="w-full max-w-[400px]"
                    onClick={() => setCreating(true)}
                    data-testid={subTestId(testId, 'start')}
                >
                    {t('post_collection_create_new')}
                </Button>
                <CollectionCreateDialog
                    open={creating}
                    onOpenChange={setCreating}
                    testId={subTestId(testId, 'panel')}
                />
            </div>
        )
    }

    return (
        <div data-testid={testId} className="flex flex-col gap-3 p-3 md:gap-6 md:px-0 md:pt-2.5">
            {collections.map(collection => (
                <CollectionCard
                    key={collection.id}
                    collection={collection}
                    href={collectionHref(slug, collection.id)}
                    menu={
                        <CollectionOwnerMenu
                            collectionId={collection.id}
                            name={collection.name ?? ''}
                            channelId={channelId}
                            testId={subTestId(testId, 'item')}
                        />
                    }
                    testId={subTestId(testId, 'row')}
                />
            ))}

            {isFetchingNextPage ? <CollectionCardSkeleton /> : null}

            {/* Zero-height, so it never adds space to a list that has stopped growing. */}
            <div ref={sentinelRef} aria-hidden="true" className="-mt-3 h-px md:-mt-6" />
        </div>
    )
}
