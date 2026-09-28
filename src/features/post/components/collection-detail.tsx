'use client'

import { postShareContext, ShareDialog } from '@features/share'
import { DialogScreenHeader } from '@shared/components/dialog-screen-header'
import { useInView } from '@shared/hooks/use-in-view'
import { useRenderWindow, windowKeyProps } from '@shared/hooks/use-render-window'
import { useTranslation } from '@shared/i18n/use-translation'
import { subTestId } from '@shared/lib/test-id'
import { Button } from '@shared/ui/button'
import { ConfirmDialog } from '@shared/ui/confirm-dialog'
import { Dialog, DialogContent } from '@shared/ui/dialog'
import { Icon } from '@shared/ui/icon'
import { Skeleton } from '@shared/ui/skeleton'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import type { Post } from '../api/types'
import { useCollection } from '../hooks/use-collection-posts'
import { usePostSlider } from '../hooks/use-post-slider'
import { PostCard } from './post-card'
import { PostMediaLightbox } from './post-media-lightbox'

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
    collectionId,
    isOwner = false,
    isPremiumReader = false,
    onDeleted,
    testId = 'post-collection',
}: {
    collectionId: string
    /** The reader owns this collection — renaming, deleting and unfiling are theirs alone. */
    isOwner?: boolean
    /** Premium readers are exempt from paid interaction — read by the host, not here. */
    isPremiumReader?: boolean
    /** The collection was deleted; the host navigates away. */
    onDeleted?: () => void
    testId?: string
}) {
    const { t } = useTranslation()
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
        rename,
        isRenaming,
        remove,
        isRemoving,
        unfile,
    } = useCollection(collectionId, { onDeleted })

    const [sharing, setSharing] = useState<Post | null>(null)

    /*
     * One viewer for the whole list, so it can page between **posts** — `usePostSlider` carries
     * why the list owns that and the viewer does not. The same arrangement as the share sheet.
     */
    const slider = usePostSlider(posts, { onLoadMore: loadMore, hasMore: hasNextPage })

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
            isOwner={isOwner}
            currentName={collection?.name ?? ''}
            onRename={rename}
            isRenaming={isRenaming}
            onDelete={remove}
            isDeleting={isRemoving}
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
                <CollectionNotice
                    title={t('collection_empty')}
                    body={isOwner ? t('collection_empty_body_owner') : undefined}
                    testId={testId}
                />
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

                {slider.post ? (
                    <PostMediaLightbox
                        images={slider.post.images ?? []}
                        video={slider.open?.target === 'video' ? slider.post.video : null}
                        startIndex={
                            typeof slider.open?.target === 'number' ? slider.open.target : 0
                        }
                        post={slider.post}
                        isPremiumReader={isPremiumReader}
                        onShare={() => setSharing(slider.post)}
                        onPrevPost={slider.prev}
                        onNextPost={slider.next}
                        positionLabel={slider.positionLabel}
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

/** The three states that are not a list, sharing one shape so their geometry cannot drift. */
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

/**
 * The screen's own app bar — back, the collection's name, and the owner's two writes.
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
 * The title is the collection's **name**, which arrives from a query, and the two actions write to
 * the same query. A server-rendered bar would have to be handed all three through props that only a
 * client component could fill — so the bar is where the data already is, and `page.tsx` renders the
 * column around it.
 */
function CollectionBar({
    title,
    isOwner,
    currentName,
    onRename,
    isRenaming,
    onDelete,
    isDeleting,
    testId,
}: {
    title: string
    isOwner: boolean
    currentName: string
    onRename: (name: string) => void
    isRenaming: boolean
    onDelete: () => void
    isDeleting: boolean
    testId?: string
}) {
    const { t } = useTranslation()
    const router = useRouter()
    const [renaming, setRenaming] = useState(false)
    const [deleting, setDeleting] = useState(false)
    const [draft, setDraft] = useState('')

    return (
        <>
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

                {isOwner ? (
                    <>
                        <button
                            type="button"
                            aria-label={t('collection_rename')}
                            disabled={isRenaming}
                            onClick={() => {
                                setDraft(currentName)
                                setRenaming(true)
                            }}
                            data-testid={subTestId(testId, 'apply')}
                            className="flex size-10 flex-none items-center justify-center rounded-full text-(--icon-default) transition-colors hover:bg-(--background-segment) disabled:opacity-40"
                        >
                            <Icon name="pen-line" size={20} />
                        </button>
                        <button
                            type="button"
                            aria-label={t('collection_delete')}
                            disabled={isDeleting}
                            onClick={() => setDeleting(true)}
                            data-testid={subTestId(testId, 'clear')}
                            className="flex size-10 flex-none items-center justify-center rounded-full text-(--icon-default) transition-colors hover:bg-(--background-segment) disabled:opacity-40"
                        >
                            <Icon name="trash" size={20} />
                        </button>
                    </>
                ) : null}
            </div>

            <Dialog
                open={renaming}
                onOpenChange={next => {
                    if (!next && !isRenaming) setRenaming(false)
                }}
            >
                <DialogContent
                    className="flex w-full max-w-[420px] flex-col gap-0 p-0"
                    data-testid={subTestId(testId, 'panel')}
                >
                    <DialogScreenHeader
                        title={t('collection_rename')}
                        onClose={() => setRenaming(false)}
                        disabled={isRenaming}
                        testId={subTestId(testId, 'title')}
                    />
                    <div className="flex flex-col gap-3 p-4">
                        <input
                            value={draft}
                            autoFocus
                            disabled={isRenaming}
                            aria-label={t('post_collection_name_label')}
                            placeholder={t('post_collection_name_placeholder')}
                            data-testid={subTestId(testId, 'input')}
                            onChange={event => setDraft(event.target.value)}
                            onKeyDown={event => {
                                if (event.key !== 'Enter' || !draft.trim()) return
                                event.preventDefault()
                                onRename(draft.trim())
                                setRenaming(false)
                            }}
                            className="type-body-default rounded-(--radius-sm) border border-(--input-border) bg-transparent px-3 py-2 text-(--text-title) placeholder:text-(--text-placeholder)"
                        />
                        <div className="flex justify-end">
                            <Button
                                variant="primary"
                                size="medium"
                                disabled={
                                    !draft.trim() || draft.trim() === currentName || isRenaming
                                }
                                onClick={() => {
                                    onRename(draft.trim())
                                    setRenaming(false)
                                }}
                                data-testid={subTestId(testId, 'submit')}
                            >
                                {t('common_save')}
                            </Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>

            <ConfirmDialog
                open={deleting}
                onOpenChange={setDeleting}
                title={t('collection_delete_title')}
                /* Says what is *not* lost, because that is the part a reader cannot check first. */
                description={t('collection_delete_body')}
                confirmLabel={t('collection_delete')}
                onConfirm={() => {
                    onDelete()
                    setDeleting(false)
                }}
                pending={isDeleting}
                destructive
                testId={subTestId(testId, 'confirm')}
            />
        </>
    )
}
