'use client'

import { useInView } from '@shared/hooks/use-in-view'
import { useTranslation } from '@shared/i18n/use-translation'
import { formatCompactCount } from '@shared/lib/format-count'
import { subTestId } from '@shared/lib/test-id'
import { Button } from '@shared/ui/button'
import { Icon } from '@shared/ui/icon'
import { Skeleton } from '@shared/ui/skeleton'
import Link from 'next/link'
import { useEffect } from 'react'
import { useCollections } from '../hooks/use-collections'
import { collectionHref } from '../routes'

/**
 * `/@{slug}/collections` — the creator's collections, as a list of names to open.
 *
 * ## Rows, not cards, and **no** render window
 *
 * A collection row is a name, a count and a chevron. `useRenderWindow` exists because a `PostCard`
 * is expensive to keep mounted — an avatar, a media block, a Lottie instance — and none of that is
 * true here: a hundred of these rows is less DOM than four cards. Windowing them would add a
 * measure-and-stand-down cycle to save nothing, which is the opposite of what the hook is for. The
 * **detail** screen, which draws real posts, does window.
 *
 * ## It reads the same query the composer's picker does
 *
 * One key, one cache entry. A collection created in the composer appears here without this screen
 * knowing the composer exists, and a rename here reaches the picker the same way.
 */
export function CollectionList({
    slug,
    testId = 'post-collections',
}: {
    /** The space the URL is under — the rows link within it. */
    slug: string
    testId?: string
}) {
    const { t, currentLanguage } = useTranslation()
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

    const [sentinelRef, sentinelInView] = useInView<HTMLDivElement>({
        enabled: hasMore && !isFetchingNextPage,
    })

    useEffect(() => {
        if (sentinelInView) loadMore()
    }, [sentinelInView, loadMore])

    if (isLoading) {
        return (
            <div data-testid={subTestId(testId, 'list')} aria-busy="true" className="flex flex-col">
                {Array.from({ length: 5 }, (_, index) => (
                    <div
                        // biome-ignore lint/suspicious/noArrayIndexKey: placeholders have no identity but their position.
                        key={index}
                        className="flex flex-col gap-2 border-(--separator-default) border-b px-4 py-4"
                    >
                        <Skeleton h={18} className="w-1/2 rounded-(--radius-sm)" />
                        <Skeleton h={12} className="w-20 rounded-(--radius-sm)" />
                    </div>
                ))}
            </div>
        )
    }

    if (isError) {
        return (
            <CollectionNotice
                title={t('collections_error')}
                action={{ label: t('common_retry'), onPress: () => void refetch() }}
                testId={testId}
            />
        )
    }

    if (isEmpty) {
        return (
            <CollectionNotice
                title={t('collections_empty')}
                body={t('collections_empty_body')}
                testId={testId}
            />
        )
    }

    return (
        <div data-testid={testId} className="flex flex-col">
            {collections.map((collection, index) => (
                /*
                 * A real `<Link>`, so a row is middle-clickable and openable in a new tab. The
                 * hairline sits **between** rows for `PostCollectionPicker`'s reason: a rule under
                 * the last one separates the list from nothing.
                 */
                <Link
                    key={collection.id}
                    href={collectionHref(slug, collection.id)}
                    data-option-value={collection.id}
                    data-testid={subTestId(testId, 'row')}
                    className={
                        index === 0
                            ? 'flex items-center justify-between gap-3 px-4 py-4 transition-colors hover:bg-(--background-segment)'
                            : 'flex items-center justify-between gap-3 border-(--separator-default) border-t px-4 py-4 transition-colors hover:bg-(--background-segment)'
                    }
                >
                    <span className="flex min-w-0 flex-col gap-1">
                        <span className="type-body-strong truncate text-(--text-title)">
                            {collection.name}
                        </span>
                        {/* Legacy's leading dot, and no line at all for a collection holding nothing. */}
                        {collection.post_count > 0 ? (
                            <span className="type-caption-meta flex items-center gap-1 text-(--text-subtitle)">
                                <span
                                    aria-hidden="true"
                                    className="size-1 rounded-full bg-current"
                                />
                                {t('post_collection_count', {
                                    count: collection.post_count,
                                    formatted: formatCompactCount(
                                        collection.post_count,
                                        currentLanguage,
                                    ),
                                })}
                            </span>
                        ) : null}
                    </span>
                    <Icon
                        name="angle-right"
                        size={20}
                        aria-hidden
                        className="flex-none text-(--icon-secondary)"
                    />
                </Link>
            ))}

            {/* Zero-height, so it never adds space to a list that has stopped growing. */}
            <div ref={sentinelRef} aria-hidden="true" className="h-px" />
        </div>
    )
}

/** The two states that are not a list. One component, so their geometry cannot drift apart. */
function CollectionNotice({
    title,
    body,
    action,
    testId,
}: {
    title: string
    body?: string
    action?: { label: string; onPress: () => void }
    testId?: string
}) {
    return (
        <div
            data-testid={subTestId(testId, 'message')}
            className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-16 text-center"
        >
            <Icon name="history-rectangle-play" size={32} className="text-(--icon-disabled)" />
            <p className="type-title-t4-semibold text-(--text-title)">{title}</p>
            {body ? (
                <p className="type-dense-default max-w-[400px] text-(--text-subtitle)">{body}</p>
            ) : null}
            {action ? (
                <Button
                    variant="secondary"
                    size="medium"
                    onClick={action.onPress}
                    data-testid={subTestId(testId, 'retry')}
                >
                    {action.label}
                </Button>
            ) : null}
        </div>
    )
}
