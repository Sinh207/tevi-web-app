'use client'

import { postShareContext, ShareDialog } from '@features/share'
import { useInView } from '@shared/hooks/use-in-view'
import { useRenderWindow, windowKeyProps } from '@shared/hooks/use-render-window'
import { useTranslation } from '@shared/i18n/use-translation'
import { subTestId } from '@shared/lib/test-id'
import { Button } from '@shared/ui/button'
import { Skeleton } from '@shared/ui/skeleton'
import Image from 'next/image'
import Link from 'next/link'
import { type ReactNode, useEffect, useMemo, useState } from 'react'
import type { Post } from '../api/types'
import { type CollectionOwnership, useCollection } from '../hooks/use-collection-posts'
import { usePostSlider } from '../hooks/use-post-slider'
import { COLLECTION_ART } from '../lib/illustrations'
import { openPostComposer } from '../store/composer-store'
import { CollectionAddPostsDialog } from './collection-add-posts-dialog'
import { CollectionCard, CollectionCardSkeleton, CollectionScreenHeader } from './collection-card'
import { CollectionOwnerMenu } from './collection-owner-menu'
import { PostCard } from './post-card'
import { PostSlider } from './post-slider'

/**
 * `/@{slug}/collections/{id}` — one collection's posts.
 *
 * ## The same list the feed is, windowed for the same reason
 *
 * `PostCard`, one share sheet for the whole list, a sentinel for the next page, and
 * `useRenderWindow` over the rows — a collection is an ordinary post list with a filter on it, so
 * anything true of a feed's rows is true here. Ten rows in the DOM once the reader has settled
 * somewhere; the rest stand down to a box of the height they had, measured first so nothing above
 * them collapses and moves the page.
 *
 * The **list of collections** is not windowed, and its own file says why: a row of name-and-count
 * is not what the hook exists for.
 *
 * ## Taking a post out is *Edit collection*, not a control on each card
 *
 * Legacy's shape: the owner's menu on the collection's card opens *Edit collection*, which lists
 * these same posts with a *Remove* on each and applies them together. A button stamped on every
 * `PostCard` was tried first and is not legacy's — and the card has no idea it is in a collection,
 * the same reason `/bookmarks` keeps its own actions off it.
 */
export function CollectionDetail({
    slug,
    collectionId,
    ownership,
    ownerChannelId = null,
    isPremiumReader = false,
    onDeleted,
    testId = 'post-collection',
}: {
    /** The space the URL is under, bare — a viewer reads the collection through it. */
    slug: string
    collectionId: string
    /**
     * Whose collection this is, as far as the host knows. `owner` offers renaming, deleting and
     * unfiling and reads the account-scoped endpoint; `viewer` reads through the space; `unknown`
     * asks nothing yet. `useCollection` carries why the third state exists.
     */
    ownership: CollectionOwnership
    /** The owner's own channel — *Add posts* searches it. Ignored unless `ownership` is `owner`. */
    ownerChannelId?: string | null
    /** Premium readers are exempt from paid interaction — read by the host, not here. */
    isPremiumReader?: boolean
    /** The collection was deleted; the host navigates away. */
    onDeleted?: () => void
    testId?: string
}) {
    const { t } = useTranslation()
    const isOwner = ownership === 'owner'
    const {
        posts,
        isLoading,
        isError,
        isEmpty,
        isMissing,
        isSignedOut,
        refetch,
        hasNextPage,
        isFetchingNextPage,
        loadMore,
        collection,
    } = useCollection(collectionId, { slug, ownership, onDeleted })

    const [sharing, setSharing] = useState<Post | null>(null)
    /** *Add posts* from the empty state — the menu in the bar opens its own. */
    const [adding, setAdding] = useState(false)

    /*
     * One viewer for the whole list, so it can page between **posts** — `usePostSlider` carries
     * why the list owns that and the viewer does not. The same arrangement as the share sheet.
     */
    const slider = usePostSlider(posts)

    const keys = useMemo(() => posts.map(post => post.id), [posts])
    const { observe, heightFor } = useRenderWindow(keys)

    const [sentinelRef, sentinelInView] = useInView<HTMLDivElement>({
        enabled: hasNextPage && !isFetchingNextPage,
    })

    useEffect(() => {
        if (sentinelInView) loadMore()
    }, [sentinelInView, loadMore])

    /*
     * Legacy's top of the screen: its own bar with a fixed title, then the collection as a card —
     * the same card the list draws, not a link here, carrying the owner's menu. The bar says where
     * the reader is (Collections), the card says which one.
     */
    const bar = (
        <div className="flex flex-col gap-px md:gap-2.5">
            <CollectionScreenHeader
                title={t('collections_header')}
                size="detail"
                testId={subTestId(testId, 'header')}
            />
            {collection ? (
                <CollectionCard
                    collection={collection}
                    menu={
                        isOwner ? (
                            <CollectionOwnerMenu
                                collectionId={collectionId}
                                name={collection.name ?? ''}
                                channelId={ownerChannelId}
                                onDeleted={onDeleted}
                                testId="post-collection-menu"
                            />
                        ) : null
                    }
                    testId={subTestId(testId, 'title')}
                />
            ) : isLoading ? (
                <CollectionCardSkeleton />
            ) : null}
        </div>
    )

    /*
     * Checked first, and before `isLoading`: neither query runs without an account, so a guest
     * would otherwise be shown the **empty** state — "this collection's just getting started" for
     * a collection they simply cannot see. `/bookmarks` takes the same order for the same reason.
     */
    if (isSignedOut) {
        return (
            <>
                {bar}
                <CollectionNotice title={t('collections_signed_out')} testId={testId} />
            </>
        )
    }

    if (isLoading) {
        return (
            <>
                {bar}
                <CollectionSkeleton testId={testId} />
            </>
        )
    }

    /*
     * Checked before the list's own error: a collection that does not exist has no posts either, so
     * both queries fail and "couldn't load the posts" would be the less useful of two true things.
     */
    if (isMissing) {
        return (
            <>
                {bar}
                <CollectionNotice title={t('collection_missing')} testId={testId} />
            </>
        )
    }

    if (isError) {
        return (
            <>
                {bar}
                <CollectionNotice
                    title={t('collection_error')}
                    action={{ label: t('common_retry'), onPress: refetch }}
                    testId={testId}
                />
            </>
        )
    }

    if (isEmpty) {
        return (
            <>
                {bar}
                {/*
                 * Legacy's two readings of one state: to the owner it is a prompt, to a visitor it
                 * is a dead end, so the visitor is handed the way back to the space — where the
                 * other collections are.
                 */}
                <CollectionNotice
                    title={t(isOwner ? 'collection_empty_owner' : 'collection_empty')}
                    body={t('collection_empty_body')}
                    art
                    testId={testId}
                >
                    {isOwner ? (
                        <div className="flex w-full max-w-[400px] flex-col gap-2">
                            <Button
                                variant="primary"
                                size="medium"
                                onClick={() => openPostComposer({ collectionIds: [collectionId] })}
                                data-testid="post-collection-create-post"
                            >
                                {t('collection_create_post')}
                            </Button>
                            <Button
                                variant="secondary"
                                size="medium"
                                onClick={() => setAdding(true)}
                                data-testid="post-collection-add-posts"
                            >
                                {t('collection_add_posts')}
                            </Button>
                            <CollectionAddPostsDialog
                                open={adding}
                                onOpenChange={setAdding}
                                collectionId={collectionId}
                                channelId={ownerChannelId}
                            />
                        </div>
                    ) : (
                        <Button
                            variant="primary"
                            size="medium"
                            className="w-full max-w-[400px]"
                            render={<Link href={`/@${slug}`} />}
                            data-testid="post-collection-browse"
                        >
                            {t('collection_browse_others')}
                        </Button>
                    )}
                </CollectionNotice>
            </>
        )
    }

    return (
        <>
            {bar}
            {/* Legacy's posts block: 1px between cards, 16px corners from `md`, 10px under the card. */}
            <div
                data-testid={testId}
                className="flex min-w-0 flex-col gap-px md:mt-2.5 md:overflow-clip md:rounded-(--radius-xl)"
            >
                {posts.map((post, index) => {
                    const height = heightFor(post.id)
                    return (
                        <div
                            key={post.id}
                            ref={observe}
                            {...windowKeyProps(post.id)}
                            className="min-w-0 bg-(--background-surface)"
                            /* Held open at the height it had; drawn empty rather than as a skeleton. */
                            style={height === null ? undefined : { height }}
                        >
                            {height === null ? (
                                <PostCard
                                    post={post}
                                    isPremiumReader={isPremiumReader}
                                    onShare={() => setSharing(post)}
                                    onOpenMedia={target => slider.openAt(index, target)}
                                    onChanged={refetch}
                                    onAuthorBlocked={refetch}
                                    testId={subTestId(testId, 'item')}
                                />
                            ) : null}
                        </div>
                    )
                })}

                {/* Zero-height, so it never adds space to a list that has stopped growing. */}
                <div ref={sentinelRef} aria-hidden="true" className="h-px" />

                {isFetchingNextPage ? <CollectionSkeleton rows={1} testId={testId} /> : null}

                {slider.open ? (
                    <PostSlider
                        posts={posts}
                        index={slider.open.index}
                        onIndexChange={slider.goTo}
                        onLoadMore={loadMore}
                        hasMore={hasNextPage}
                        isPremiumReader={isPremiumReader}
                        onShare={setSharing}
                        onClose={slider.close}
                    />
                ) : null}

                {sharing ? (
                    <ShareDialog
                        open
                        onOpenChange={next => {
                            if (!next) setSharing(null)
                        }}
                        url={sharing.shareable_url ?? ''}
                        title={sharing.text}
                        image={sharing.cover_image?.uri ?? sharing.images?.[0]?.uri ?? null}
                        context={postShareContext(sharing, 'collection')}
                    />
                ) : null}
            </div>
        </>
    )
}

/** Card-shaped placeholders — a screen's worth, or one when a page is on its way in. */
function CollectionSkeleton({ rows = 3, testId }: { rows?: number; testId?: string }) {
    return (
        <div
            data-testid={subTestId(testId, 'list')}
            aria-busy="true"
            className="flex flex-col gap-px"
        >
            {Array.from({ length: rows }, (_, index) => (
                <div
                    // biome-ignore lint/suspicious/noArrayIndexKey: placeholders have no identity but their position.
                    key={index}
                    className="flex flex-col gap-3 bg-(--background-surface) px-3 py-5 md:px-6"
                >
                    <div className="flex items-center gap-2">
                        <Skeleton h={40} className="w-10 rounded-full" />
                        <Skeleton h={16} className="w-40 rounded-(--radius-sm)" />
                    </div>
                    <Skeleton h={14} className="w-3/4 rounded-(--radius-sm)" />
                    <Skeleton h={200} className="w-full rounded-[8px]" />
                </div>
            ))}
        </div>
    )
}

/**
 * The states that are not a list, sharing one shape so their geometry cannot drift — legacy's
 * `noPost` card: the surface, 50px 16px, 20px between its parts, the title at 16/600.
 */
function CollectionNotice({
    title,
    body,
    action,
    art = false,
    children,
    testId,
}: {
    title: string
    body?: string
    action?: { label: string; onPress: () => void }
    /** Legacy's illustration — drawn for an empty collection, not for a failure. */
    art?: boolean
    /** Anything else the state offers — the empty state's own buttons. */
    children?: ReactNode
    testId?: string
}) {
    return (
        <div
            data-testid={subTestId(testId, 'message')}
            className="flex flex-col items-center justify-center gap-5 bg-(--background-surface) px-4 py-[50px] text-center md:mt-2.5 md:rounded-(--radius-xl)"
        >
            {art ? (
                <Image
                    src={COLLECTION_ART.noPosts.src}
                    alt=""
                    width={COLLECTION_ART.noPosts.width}
                    height={COLLECTION_ART.noPosts.height}
                />
            ) : null}
            <div className="flex max-w-[400px] flex-col items-center gap-1">
                <p className="type-body-strong text-(--text-title)">{title}</p>
                {body ? <p className="type-dense-default text-(--text-body)">{body}</p> : null}
            </div>
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
            {children}
        </div>
    )
}
