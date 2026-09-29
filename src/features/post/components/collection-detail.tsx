'use client'

import { postShareContext, ShareDialog } from '@features/share'
import { useInView } from '@shared/hooks/use-in-view'
import { useRenderWindow, windowKeyProps } from '@shared/hooks/use-render-window'
import { useTranslation } from '@shared/i18n/use-translation'
import { subTestId } from '@shared/lib/test-id'
import { Button } from '@shared/ui/button'
import { Icon } from '@shared/ui/icon'
import { Skeleton } from '@shared/ui/skeleton'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { type ReactNode, useEffect, useMemo, useState } from 'react'
import type { Post } from '../api/types'
import { type CollectionOwnership, useCollection } from '../hooks/use-collection-posts'
import { usePostSlider } from '../hooks/use-post-slider'
import { openPostComposer } from '../store/composer-store'
import { CollectionAddPostsDialog } from './collection-add-posts-dialog'
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
 * ## Unfiling is the card's menu, not a control on the row
 *
 * A post is removed from a collection through this screen's own action rather than the card's,
 * because the card has no idea it is in one — the same shape `/bookmarks` takes. It is offered only
 * to the owner, and it is deliberately worded as *remove from collection*: the post stays on its
 * space, and a button that read "delete" next to a post would be the wrong promise entirely.
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
        unfile,
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

    const bar = (
        <CollectionBar
            title={collection?.name ?? t('collections_title')}
            actions={
                isOwner && collection ? (
                    <CollectionOwnerMenu
                        collectionId={collectionId}
                        name={collection.name ?? ''}
                        channelId={ownerChannelId}
                        onDeleted={onDeleted}
                        testId="post-collection-menu"
                    />
                ) : null
            }
            testId={subTestId(testId, 'header')}
        />
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
            <div data-testid={testId} className="flex min-w-0 flex-col gap-px">
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
                                <div className="relative">
                                    <PostCard
                                        post={post}
                                        isPremiumReader={isPremiumReader}
                                        onShare={() => setSharing(post)}
                                        onOpenMedia={target => slider.openAt(index, target)}
                                        onChanged={refetch}
                                        onAuthorBlocked={refetch}
                                        testId={subTestId(testId, 'item')}
                                    />
                                    {isOwner ? (
                                        <button
                                            type="button"
                                            /*
                                             * `data-no-navigate`, or the card's own press handler takes
                                             * the reader to the post they were trying to unfile —
                                             * `post-card.tsx`'s `shouldNavigate` reads this attribute.
                                             */
                                            data-no-navigate
                                            data-card-id={post.id}
                                            data-testid={subTestId(testId, 'remove')}
                                            onClick={() => unfile(post.id)}
                                            className="type-caption-meta absolute end-3 bottom-3 flex h-8 items-center gap-1 rounded-full bg-(--background-segment) px-3 text-(--text-subtitle) transition-colors hover:opacity-80 md:end-4"
                                        >
                                            <Icon name="xmark" size={16} className="flex-none" />
                                            {t('collection_remove_post')}
                                        </button>
                                    ) : null}
                                </div>
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

/** The states that are not a list, sharing one shape so their geometry cannot drift. */
function CollectionNotice({
    title,
    body,
    action,
    children,
    testId,
}: {
    title: string
    body?: string
    action?: { label: string; onPress: () => void }
    /** Anything else the state offers — the empty state's own buttons. */
    children?: ReactNode
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
            {children}
        </div>
    )
}

/**
 * The screen's own app bar — back, the collection's name, and the owner's menu.
 *
 * ## Why this is not `PageBackBar`
 *
 * `features/navigation` imports `@features/post` (`use-create-action.ts` opens the composer), so
 * this feature importing navigation back would close a barrel cycle — the same reason
 * `features/auth` draws its own `TwoFaBackBar` rather than reaching for the shared one. ESM resolves
 * such a cycle by handing one side a half-initialised module, which is an `undefined is not a
 * function` at render rather than a build error.
 *
 * ## Why the bar and not the route
 *
 * The title is the collection's **name**, which arrives from a query, and the menu beside it writes
 * to the same query. A server-rendered bar would have to be handed all three through props that only a
 * client component could fill — so the bar is where the data already is, and `page.tsx` renders the
 * column around it.
 */
function CollectionBar({
    title,
    actions,
    testId,
}: {
    title: string
    /** The owner's menu, or nothing — a visitor gets the title and the way back. */
    actions: ReactNode
    testId?: string
}) {
    const { t } = useTranslation()
    const router = useRouter()

    return (
        <div className="sticky top-0 z-20 flex h-14 items-center gap-1 bg-(--background) px-2">
            <button
                type="button"
                aria-label={t('common_back')}
                onClick={() => router.back()}
                data-testid={subTestId(testId, 'prev')}
                className="flex size-10 flex-none items-center justify-center rounded-full text-(--text-title) transition-colors hover:bg-(--background-segment)"
            >
                <Icon name="angle-left" size={20} />
            </button>

            {/* `truncate` needs a bounded box, and `min-w-0` inside a flex row is that box. */}
            <h1 className="type-title-t4-semibold min-w-0 flex-1 truncate text-(--text-title)">
                {title}
            </h1>

            {actions}
        </div>
    )
}
