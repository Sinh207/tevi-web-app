'use client'

import { postShareContext, ShareDialog } from '@features/share'
import { useInView } from '@shared/hooks/use-in-view'
import { useRenderWindow, windowKeyProps } from '@shared/hooks/use-render-window'
import { useTranslation } from '@shared/i18n/use-translation'
import { subTestId } from '@shared/lib/test-id'
import { Button } from '@shared/ui/button'
import { Icon } from '@shared/ui/icon'
import { Skeleton } from '@shared/ui/skeleton'
import { useEffect, useMemo, useState } from 'react'
import type { Post } from '../api/types'
import { usePostDetail } from '../hooks/use-post-detail'
import { usePostReplies } from '../hooks/use-post-replies'
import { PostCard } from './post-card'

/**
 * `/@{slug}/post/{code}` — one post and its replies.
 *
 * ## The card is the same `PostCard` the feed draws, with its navigation switched off
 *
 * `postHref`'s `disabled` option exists for exactly this caller — legacy calls it
 * `disablePostDetail` and passes it from four places. Without it the post would be a link to the
 * page it is already on, and the whole-card click would push a duplicate history entry.
 *
 * Reusing the card rather than writing a detail-specific one is what keeps the paywall, the NSFW
 * guard, the menu and the four gates identical between a feed row and the page it opens. Legacy
 * has two implementations and its detail view is where the unlock flow drifted.
 *
 * ## Replies are `PostCard` too, and ⚠ that is a **placeholder shape**
 *
 * A reply carries the same DTO as a post (`postApi.getReplies` says so, and `normalizePosts`
 * parses both), so every gate the card applies is correct for a reply. What is *not* established
 * is the geometry: the Figma file draws a reply row that is denser than a post card — no cover
 * media block, a smaller avatar — and those comps were not consulted here. This renders a correct,
 * fully-gated reply at the wrong density, which is the honest placeholder; a second card invented
 * from scratch would be the wrong one *and* a second place for the gates to drift.
 *
 * ## No composer
 *
 * Writing a reply is deliberately not in this screen yet. It is its own feature — a paid
 * interaction with a Star cost, a `useRequireStars` gate, an optimistic row and an upload path —
 * and bolting a text box onto this page would be the shallow half of it.
 */
export function PostDetailView({
    identifier,
    serverPost,
    testId = 'post-detail',
}: {
    /** The id or code from the URL — either addresses the same post. */
    identifier: string
    /** The anonymous body fetched during the render; see `usePostDetail` for why it is not cached. */
    serverPost: Post | null
    testId?: string
}) {
    const { t } = useTranslation()
    const { post, isLoading, isError, refetch, isMissing } = usePostDetail(identifier, serverPost)

    const replies = usePostReplies(post && !post.deleted ? post.id : null)

    /** One sheet for the page, holding whichever post or reply raised it — the feed's arrangement. */
    const [sharing, setSharing] = useState<Post | null>(null)

    const keys = useMemo(() => replies.replies.map(reply => reply.id), [replies.replies])
    const { observe, heightFor } = useRenderWindow(keys)

    const [sentinelRef, sentinelInView] = useInView<HTMLDivElement>({
        enabled: replies.hasNextPage && !replies.isFetchingNextPage,
    })

    useEffect(() => {
        if (sentinelInView && replies.hasNextPage && !replies.isFetchingNextPage) {
            replies.fetchNextPage()
        }
    }, [sentinelInView, replies.hasNextPage, replies.isFetchingNextPage, replies.fetchNextPage])

    if (isLoading) return <DetailSkeleton />

    /*
     * Missing and failed are different sentences and must stay different. A post deleted since the
     * link was shared is an answer — `getPost` swallows the 404 to make it one — and telling that
     * reader to retry sends them round a loop that cannot succeed.
     */
    if (isMissing) {
        return (
            <DetailNotice
                icon="comment-slash"
                title={t('post_detail_missing_title')}
                body={t('post_detail_missing_body')}
                testId={testId}
            />
        )
    }

    if (isError || !post) {
        return (
            <DetailNotice
                icon="exclamation-circle"
                title={t('post_detail_error_title')}
                body={t('post_detail_error_body')}
                onRetry={() => refetch()}
                testId={testId}
            />
        )
    }

    return (
        <div data-testid={testId} className="flex min-w-0 flex-col">
            <div className="bg-(--background-surface)">
                <PostCard
                    post={post}
                    disableDetail
                    onShare={() => setSharing(post)}
                    onChanged={() => refetch()}
                    testId={subTestId(testId, 'item')}
                />
            </div>

            <RepliesSection
                replies={replies}
                onShare={setSharing}
                observe={observe}
                heightFor={heightFor}
                sentinelRef={sentinelRef}
                testId={testId}
            />

            {sharing && (
                <ShareDialog
                    open
                    onOpenChange={open => {
                        if (!open) setSharing(null)
                    }}
                    url={sharing.shareable_url ?? ''}
                    title={sharing.text}
                    image={sharing.cover_image?.uri ?? sharing.images?.[0]?.uri ?? null}
                    context={postShareContext(sharing, 'post-detail')}
                />
            )}
        </div>
    )
}

function RepliesSection({
    replies,
    onShare,
    observe,
    heightFor,
    sentinelRef,
    testId,
}: {
    replies: ReturnType<typeof usePostReplies>
    onShare: (post: Post) => void
    observe: ReturnType<typeof useRenderWindow>['observe']
    heightFor: ReturnType<typeof useRenderWindow>['heightFor']
    sentinelRef: ReturnType<typeof useInView<HTMLDivElement>>[0]
    testId: string
}) {
    const { t } = useTranslation()

    return (
        <section
            data-testid={subTestId(testId, 'group')}
            className="mt-px flex min-w-0 flex-col bg-(--background-surface)"
        >
            <h2
                data-testid={subTestId(testId, 'title')}
                className="type-title-t3-semibold px-3 pt-4 pb-2 text-(--text-title) md:px-6"
            >
                {/* The server's count, not `replies.length` — `usePostReplies` says why. */}
                {t('post_detail_replies', { count: replies.count })}
            </h2>

            {replies.isLoading ? (
                <ReplySkeleton />
            ) : replies.isError ? (
                <div className="flex flex-col items-center gap-3 px-4 py-10 text-center">
                    <p className="type-dense-default text-(--text-subtitle)">
                        {t('post_detail_replies_error')}
                    </p>
                    <Button
                        variant="secondary"
                        size="medium"
                        onClick={() => replies.refetch()}
                        data-testid={subTestId(testId, 'retry')}
                    >
                        {t('common_retry')}
                    </Button>
                </div>
            ) : replies.isEmpty ? (
                <p
                    data-testid={subTestId(testId, 'message')}
                    className="type-dense-default px-3 py-10 text-center text-(--text-placeholder) md:px-6"
                >
                    {t('post_detail_replies_empty')}
                </p>
            ) : (
                <div className="flex min-w-0 flex-col gap-px">
                    {replies.replies.map(reply => {
                        const height = heightFor(reply.id)
                        return (
                            <div
                                key={reply.id}
                                ref={observe}
                                {...windowKeyProps(reply.id)}
                                className="min-w-0 bg-(--background-surface)"
                                style={height === null ? undefined : { height }}
                            >
                                {height === null ? (
                                    <PostCard
                                        post={reply}
                                        onShare={() => onShare(reply)}
                                        onChanged={() => replies.refetch()}
                                        testId={subTestId(testId, 'row')}
                                    />
                                ) : null}
                            </div>
                        )
                    })}

                    {/* Zero-height, so it never adds space to a list that has stopped growing. */}
                    {replies.hasNextPage && (
                        <div ref={sentinelRef} aria-hidden="true" className="h-px w-full" />
                    )}
                    {replies.isFetchingNextPage && <ReplySkeleton rows={1} />}
                </div>
            )}
        </section>
    )
}

/** Matches the card's own shape, so nothing jumps at the moment the post lands. */
function DetailSkeleton() {
    return (
        <div className="flex flex-col gap-3 bg-(--background-surface) px-3 py-3 md:px-6 md:py-5">
            <div className="flex items-center gap-2">
                <Skeleton className="size-10 rounded-full" />
                <div className="flex flex-col gap-1">
                    <Skeleton h={14} className="w-[120px] rounded-(--radius-sm)" />
                    <Skeleton h={12} className="w-[80px] rounded-(--radius-sm)" />
                </div>
            </div>
            <Skeleton h={14} className="w-full rounded-(--radius-sm)" />
            <Skeleton className="aspect-video w-full rounded-[8px]" />
            <Skeleton h={32} className="w-[180px] rounded-full" />
        </div>
    )
}

function ReplySkeleton({ rows = 3 }: { rows?: number }) {
    return (
        <div className="flex flex-col gap-px" aria-busy="true">
            {Array.from({ length: rows }, (_, index) => (
                <div
                    // A placeholder's only identity is its position, and this list is replaced
                    // wholesale by the real rows rather than reordered.
                    // biome-ignore lint/suspicious/noArrayIndexKey: position is the only identity a placeholder has.
                    key={index}
                    className="flex gap-2 px-3 py-3 md:px-6"
                >
                    <Skeleton className="size-9 flex-none rounded-full" />
                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                        <Skeleton h={12} className="w-[100px] rounded-(--radius-sm)" />
                        <Skeleton h={14} className="w-full rounded-(--radius-sm)" />
                    </div>
                </div>
            ))}
        </div>
    )
}

function DetailNotice({
    icon,
    title,
    body,
    onRetry,
    testId,
}: {
    icon: 'comment-slash' | 'exclamation-circle'
    title: string
    body: string
    onRetry?: () => void
    testId: string
}) {
    const { t } = useTranslation()
    return (
        <div
            data-testid={subTestId(testId, 'message')}
            className="flex flex-col items-center justify-center gap-3 bg-(--background-surface) px-4 py-16 text-center"
        >
            <span className="flex size-12 items-center justify-center rounded-full bg-(--background-segment) text-(--icon-secondary)">
                <Icon name={icon} size={24} />
            </span>
            <p className="type-title-t3-semibold text-(--text-title)">{title}</p>
            <p className="type-dense-default max-w-[400px] text-(--text-subtitle)">{body}</p>
            {onRetry ? (
                <Button
                    variant="secondary"
                    size="medium"
                    onClick={onRetry}
                    data-testid={subTestId(testId, 'retry')}
                >
                    {t('common_retry')}
                </Button>
            ) : null}
        </div>
    )
}
