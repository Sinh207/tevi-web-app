'use client'

import { useInView } from '@shared/hooks/use-in-view'
import { useTranslation } from '@shared/i18n/use-translation'
import { formatCompactCount } from '@shared/lib/format-count'
import { subTestId } from '@shared/lib/test-id'
import { Button } from '@shared/ui/button'
import { Icon } from '@shared/ui/icon'
import { Skeleton } from '@shared/ui/skeleton'
import Image from 'next/image'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useCollections } from '../hooks/use-collections'
import { COLLECTION_ART } from '../lib/illustrations'
import { formatPostTimestamp } from '../lib/post-format'
import { collectionHref } from '../routes'
import { CollectionCreateDialog } from './collection-create'
import { CollectionOwnerMenu } from './collection-owner-menu'

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
 * ## A row is a link and a menu, side by side
 *
 * Legacy's `CollectionItem`: name, the date it was made and how many posts it holds, with the
 * owner's menu on the trailing edge. The menu is a **sibling** of the link rather than inside it, so
 * opening it is never also a navigation — legacy has to catch that with
 * `event.target.closest('[data-menu-container]')`. This screen is the owner's alone (the route checks
 * that), so every row carries the menu.
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
    /** The space the URL is under — the rows link within it. */
    slug: string
    /** The owner's own channel — each row's *Add posts* searches it. */
    channelId: string | null
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
    const [creating, setCreating] = useState(false)

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
        /* Legacy's empty screen: its illustration, "Nothing Here Yet", a line, and the way to start. */
        return (
            <div
                data-testid={subTestId(testId, 'empty')}
                className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-12 text-center"
            >
                <Image
                    src={COLLECTION_ART.empty.src}
                    alt=""
                    width={COLLECTION_ART.empty.width}
                    height={COLLECTION_ART.empty.height}
                />
                <p className="type-title-t4-semibold text-(--text-title)">
                    {t('collection_empty_owner')}
                </p>
                <p className="type-dense-default max-w-[400px] text-(--text-subtitle)">
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
        <div data-testid={testId} className="flex flex-col">
            {collections.map((collection, index) => (
                /*
                 * The hairline sits **between** rows for `PostCollectionPicker`'s reason: a rule
                 * under the last one separates the list from nothing.
                 */
                <div
                    key={collection.id}
                    className={
                        index === 0
                            ? 'flex items-center gap-1 pe-2'
                            : 'flex items-center gap-1 border-(--separator-default) border-t pe-2'
                    }
                >
                    {/* A real `<Link>`, so a row is middle-clickable and openable in a new tab. */}
                    <Link
                        href={collectionHref(slug, collection.id)}
                        data-option-value={collection.id}
                        data-testid={subTestId(testId, 'row')}
                        className="flex min-w-0 flex-1 items-center justify-between gap-3 px-4 py-4 transition-colors hover:bg-(--background-segment)"
                    >
                        <span className="flex min-w-0 flex-col gap-1">
                            <span className="type-body-strong truncate text-(--text-title)">
                                {collection.name}
                            </span>
                            <CollectionMeta
                                createdAt={collection.created_at}
                                postCount={collection.post_count}
                                locale={currentLanguage}
                                countLabel={t('post_collection_count', {
                                    count: collection.post_count,
                                    formatted: formatCompactCount(
                                        collection.post_count,
                                        currentLanguage,
                                    ),
                                })}
                            />
                        </span>
                        <Icon
                            name="angle-right"
                            size={20}
                            aria-hidden
                            className="flex-none text-(--icon-secondary) rtl:-scale-x-100"
                        />
                    </Link>
                    <CollectionOwnerMenu
                        collectionId={collection.id}
                        name={collection.name ?? ''}
                        channelId={channelId}
                        testId={subTestId(testId, 'item')}
                    />
                </div>
            ))}

            {/* Zero-height, so it never adds space to a list that has stopped growing. */}
            <div ref={sentinelRef} aria-hidden="true" className="h-px" />
        </div>
    )
}

/**
 * The line under a row's name — legacy's date, then a dot and the post count when there is one.
 * An empty collection has no count line at all, as in the picker: "0 posts" is a statement nobody
 * needs.
 */
function CollectionMeta({
    createdAt,
    postCount,
    locale,
    countLabel,
}: {
    createdAt: string | null
    postCount: number
    locale: string
    countLabel: string
}) {
    const when = createdAt ? formatPostTimestamp(createdAt, locale) : ''
    if (!when && postCount === 0) return null

    return (
        <span className="type-caption-meta flex items-center gap-1 text-(--text-subtitle)">
            {when ? <time dateTime={createdAt ?? undefined}>{when}</time> : null}
            {postCount > 0 ? (
                <>
                    {when ? (
                        <span aria-hidden="true" className="size-1 rounded-full bg-current" />
                    ) : null}
                    {countLabel}
                </>
            ) : null}
        </span>
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
