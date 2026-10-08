'use client'

import { DialogScreenHeader } from '@shared/components/dialog-screen-header'
import { ResponsiveDialog } from '@shared/components/responsive-dialog'
import { useInView } from '@shared/hooks/use-in-view'
import { useTranslation } from '@shared/i18n/use-translation'
import { subTestId } from '@shared/lib/test-id'
import { Button } from '@shared/ui/button'
import { Icon } from '@shared/ui/icon'
import { SearchBar } from '@shared/ui/search-bar'
import {
    SegmentedControl,
    SegmentedControlItem,
    SegmentedControlItemLabel,
} from '@shared/ui/segmented-control'
import { Skeleton } from '@shared/ui/skeleton'
import Image from 'next/image'
import { useEffect, useState } from 'react'
import { COLLECTION_CANDIDATE_TYPES, type CollectionCandidateType } from '../api/post-api'
import type { Post } from '../api/types'
import { useAddPostsToCollection, useCollectionCandidates } from '../hooks/use-collection-add-posts'
import { LOCK_MEDIA_GLYPH } from '../lib/media-glyph'
import { candidateAudience } from '../lib/post-access'
import { formatPostTimestamp } from '../lib/post-format'
import { mediaTileSummary } from '../lib/post-media'

const TAB_LABEL: Record<CollectionCandidateType, string> = {
    ALL: 'collection_add_tab_all',
    IMAGE: 'collection_add_tab_image',
    VIDEO: 'collection_add_tab_video',
    TEXT_ONLY: 'collection_add_tab_text',
}

/**
 * *Add posts* — pick posts the owner already published and file them into this collection.
 * Legacy's `collection/components/addPost`.
 *
 * ## Pick, then *Done* — one request for the lot
 *
 * Each row's pill toggles it in or out of a pick that spans all four tabs, and *Done* sends the
 * whole pick as one `add-posts/`. That is legacy's shape and the endpoint's (`post_ids` is a list),
 * and it is why this is not the composer's picker, where every press is applied on publish: here
 * nothing has happened until *Done*, so closing the dialog is a cancel.
 *
 * The rows are the owner's posts **not already in** the collection — the search service filters by
 * `ignore_collection_id` — so there is nothing to diff and no row can be added twice.
 *
 * ## A screen in a frame
 *
 * Legacy draws a 512×720 dialog on a desktop and a full-screen drawer below `sm`. `ResponsiveDialog`
 * is the same split: a fixed-height dialog, or a sheet from the end edge. The header is the app-bar
 * band, so its dismiss is **leading** (`docs/DESIGN_SYSTEM.md` §7).
 */
export function CollectionAddPostsDialog({
    open,
    onOpenChange,
    collectionId,
    channelId,
    testId = 'post-collection-add',
}: {
    open: boolean
    onOpenChange: (open: boolean) => void
    collectionId: string
    /** The owner's own channel — the search service is addressed by it. */
    channelId: string | null
    testId?: string
}) {
    return (
        <ResponsiveDialog
            open={open}
            onOpenChange={onOpenChange}
            /*
             * `overflow-hidden` because the list scrolls itself — `post-composer-dialog.tsx` says
             * what two scrollers do to a sticky footer.
             */
            className="flex h-[720px] max-h-[90dvh] w-full max-w-[512px] flex-col gap-0 overflow-hidden p-0"
            data-testid={testId}
        >
            {/* Its own component, so the pick and the term start empty each time it opens. */}
            {open ? (
                <AddPostsBody
                    collectionId={collectionId}
                    channelId={channelId}
                    onClose={() => onOpenChange(false)}
                    testId={testId}
                />
            ) : null}
        </ResponsiveDialog>
    )
}

function AddPostsBody({
    collectionId,
    channelId,
    onClose,
    testId,
}: {
    collectionId: string
    channelId: string | null
    onClose: () => void
    testId: string
}) {
    const { t } = useTranslation()
    const [type, setType] = useState<CollectionCandidateType>('ALL')
    const [search, setSearch] = useState('')
    const [picked, setPicked] = useState<string[]>([])

    const candidates = useCollectionCandidates({ channelId, collectionId, type, search })
    const { add, isAdding } = useAddPostsToCollection(collectionId, { onAdded: onClose })

    const [sentinelRef, sentinelInView] = useInView<HTMLDivElement>({
        enabled: candidates.hasNextPage && !candidates.isFetchingNextPage,
    })
    useEffect(() => {
        if (sentinelInView) candidates.loadMore()
    }, [sentinelInView, candidates.loadMore])

    function toggle(postId: string) {
        setPicked(current =>
            current.includes(postId) ? current.filter(id => id !== postId) : [...current, postId],
        )
    }

    return (
        <>
            <DialogScreenHeader
                title={t('collection_add_posts')}
                onClose={onClose}
                disabled={isAdding}
                testId={subTestId(testId, 'header')}
            />

            <div className="flex flex-none flex-col gap-3 px-3 pt-3">
                <SearchBar
                    data-testid={subTestId(testId, 'search')}
                    value={search}
                    onValueChange={setSearch}
                    label={t('collection_add_search')}
                    clearLabel={t('common_clear')}
                    placeholder={t('collection_add_search')}
                />
                <SegmentedControl
                    role="tablist"
                    aria-label={t('collection_add_tabs_label')}
                    variant="underline"
                >
                    {COLLECTION_CANDIDATE_TYPES.map(option => (
                        <SegmentedControlItem
                            key={option}
                            data-testid={subTestId(testId, 'tab')}
                            data-tab-id={option}
                            variant="underline"
                            selected={option === type}
                            onClick={() => setType(option)}
                            className="justify-center"
                        >
                            <SegmentedControlItemLabel>
                                {t(TAB_LABEL[option])}
                            </SegmentedControlItemLabel>
                        </SegmentedControlItem>
                    ))}
                </SegmentedControl>
            </div>

            <div
                data-testid={subTestId(testId, 'list')}
                aria-busy={candidates.isLoading || undefined}
                className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3"
            >
                {candidates.isLoading ? (
                    <CollectionPostRowSkeleton rows={4} />
                ) : candidates.isError ? (
                    <div className="flex flex-1 flex-col items-center justify-center gap-3 py-10 text-center">
                        <p className="type-dense-default text-(--text-subtitle)">
                            {t('collection_add_error')}
                        </p>
                        <Button
                            variant="secondary"
                            size="small"
                            onClick={() => void candidates.refetch()}
                            data-testid={subTestId(testId, 'retry')}
                        >
                            {t('common_retry')}
                        </Button>
                    </div>
                ) : candidates.isEmpty ? (
                    <div
                        data-testid={subTestId(testId, 'empty')}
                        className="flex flex-1 flex-col items-center justify-center gap-3 py-10 text-center"
                    >
                        <Icon name="image-gallery" size={32} className="text-(--icon-disabled)" />
                        <p className="type-dense-default text-(--text-subtitle)">
                            {t('collection_add_empty')}
                        </p>
                    </div>
                ) : (
                    <>
                        {candidates.posts.map(post => (
                            <CollectionPostRow
                                key={post.id}
                                post={post}
                                picked={picked.includes(post.id)}
                                label={
                                    picked.includes(post.id)
                                        ? t('post_collection_remove')
                                        : t('post_collection_add')
                                }
                                onToggle={() => toggle(post.id)}
                                disabled={isAdding}
                                testId={testId}
                            />
                        ))}
                        <div ref={sentinelRef} aria-hidden="true" className="h-px flex-none" />
                        {candidates.isFetchingNextPage ? (
                            <CollectionPostRowSkeleton rows={1} />
                        ) : null}
                    </>
                )}
            </div>

            {/* Legacy's `DialogActions`: one brand pill on the trailing edge, outside the scroll. */}
            <div className="flex flex-none justify-end border-(--separator-default) border-t p-3">
                <Button
                    variant="primary"
                    size="small"
                    disabled={picked.length === 0 || isAdding}
                    onClick={() => add(picked)}
                    data-testid={subTestId(testId, 'submit')}
                >
                    {t('collection_add_done')}
                </Button>
            </div>
        </>
    )
}

/**
 * One post as *Add posts* and *Edit collection* list it — legacy's `PostCollection` row: a 100px square, the date and who can see it, the
 * text on one line, and a pill saying what media it carries.
 *
 * Who can see it is read the way legacy reads it, from `viewer` and `price` rather than from
 * `postGate`: the search service's rows are the post as its **owner** sees it, and those two fields
 * are the only statement of its audience the owner's copy is guaranteed to carry.
 */
export function CollectionPostRow({
    post,
    picked,
    label,
    onToggle,
    disabled,
    testId,
}: {
    post: Post
    /** Marked — for adding here, for taking out in *Edit collection*. Published as `aria-pressed`. */
    picked: boolean
    /** What pressing does, which the two dialogs word oppositely (legacy's `type` add / edit). */
    label: string
    onToggle: () => void
    disabled: boolean
    testId: string
}) {
    const { t, currentLanguage } = useTranslation()
    const media = mediaTileSummary(post)
    const audience = candidateAudience(post)
    const when = post.created_at ? formatPostTimestamp(post.created_at, currentLanguage) : ''

    return (
        <div
            data-testid={subTestId(testId, 'row')}
            data-post-id={post.id}
            className="flex items-start gap-3"
        >
            <span className="relative size-[100px] flex-none overflow-hidden rounded-(--radius-sm) bg-(--background-segment)">
                {media.src ? (
                    <Image
                        src={media.src}
                        alt=""
                        fill
                        sizes="100px"
                        className="object-cover"
                        style={{ filter: media.blurCover ? 'blur(10px)' : undefined }}
                    />
                ) : (
                    <span className="absolute inset-0 flex items-center justify-center text-(--icon-secondary)">
                        <Icon name={LOCK_MEDIA_GLYPH.text} size={32} />
                    </span>
                )}
            </span>

            <span className="flex min-w-0 flex-1 flex-col items-start gap-1">
                <span className="type-caption-meta flex min-w-0 items-center gap-1 text-(--text-placeholder)">
                    {when ? <span className="truncate">{when}</span> : null}
                    {when && audience ? (
                        <span
                            aria-hidden="true"
                            className="size-0.5 flex-none rounded-full bg-current"
                        />
                    ) : null}
                    {audience ? (
                        <>
                            <Icon
                                name={audience.kind === 'free' ? 'user-simple-alt' : 'badge-dollar'}
                                size={16}
                                className="flex-none"
                            />
                            <span className="flex-none">
                                {audience.kind === 'price'
                                    ? t('collection_add_price', { amount: audience.amount })
                                    : t(
                                          audience.kind === 'member'
                                              ? 'collection_add_member'
                                              : 'collection_add_free',
                                      )}
                            </span>
                        </>
                    ) : null}
                </span>

                {post.text ? (
                    <span className="type-dense-strong w-full truncate text-(--text-title)">
                        {post.text}
                    </span>
                ) : null}

                {/* Legacy's dark pill: an image count, a duration, or "Text only". */}
                <span className="type-caption-meta flex items-center gap-1 rounded-full bg-black/50 px-1.5 py-0.5 text-white">
                    {media.images > 0 ? (
                        <>
                            <Icon name={LOCK_MEDIA_GLYPH.images} size={16} className="size-3" />
                            {media.images}
                        </>
                    ) : media.duration ? (
                        <>
                            <Icon name={LOCK_MEDIA_GLYPH.video} size={16} className="size-3" />
                            {media.duration}
                        </>
                    ) : (
                        <>
                            <Icon name={LOCK_MEDIA_GLYPH.text} size={16} className="size-3" />
                            {t('collection_add_tab_text')}
                        </>
                    )}
                </span>
            </span>

            {/* The composer picker's pill and its two words — what pressing does, not the state. */}
            <Button
                variant="secondary"
                size="small"
                disabled={disabled}
                aria-pressed={picked}
                onClick={onToggle}
                data-testid={subTestId(testId, 'option')}
                data-post-id={post.id}
                className="flex-none"
            >
                {label}
            </Button>
        </div>
    )
}

export function CollectionPostRowSkeleton({ rows }: { rows: number }) {
    return (
        <>
            {Array.from({ length: rows }, (_, index) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: placeholders have no identity but their position.
                <div key={index} className="flex items-start gap-3">
                    <Skeleton h={100} className="w-[100px] flex-none rounded-(--radius-sm)" />
                    <div className="flex min-w-0 flex-1 flex-col gap-2 pt-1">
                        <Skeleton h={12} className="w-1/2 rounded-(--radius-sm)" />
                        <Skeleton h={14} className="w-3/4 rounded-(--radius-sm)" />
                        <Skeleton h={18} className="w-12 rounded-full" />
                    </div>
                </div>
            ))}
        </>
    )
}
