'use client'

import { type Post, PostCard, PostMediaLightbox, usePostSlider } from '@features/post'
import { postShareContext, ShareDialog } from '@features/share'
import { useInView } from '@shared/hooks/use-in-view'
import { useRenderWindow, windowKeyProps } from '@shared/hooks/use-render-window'
import { useTranslation } from '@shared/i18n/use-translation'
import { cn } from '@shared/lib/utils'
import { Skeleton } from '@shared/ui/skeleton'
import { useEffect, useMemo, useState } from 'react'
import type { ThreadKind } from '../api/channel-api'
import { useChannelThreads } from '../hooks/use-channel-threads'
import { useMyChannel } from '../providers/my-channel-provider'
import { ChannelEmptyState } from './channel-empty-state'
import { ChannelError } from './channel-error'
import { ChannelMediaTile } from './channel-media-tile'

/**
 * A channel's posts or media as an infinite list — the four states, and the sentinel.
 *
 * ## The sentinel loads *before* the reader arrives
 *
 * `useInView` defaults to `rootMargin: '600px'`, about a screen of lead time, so the next page is
 * already in flight by the time the last row scrolls up. A loader that only fires once the sentinel
 * is genuinely visible always shows a spinner — which reads as slowness rather than as loading.
 *
 * `enabled: hasNextPage` detaches the observer when there is nothing left, rather than leaving one
 * attached to an element whose callback would do nothing.
 */
/**
 * No `enabled` prop, and that is deliberate: the tab shell mounts **only the active panel**
 * (`mountAll={false}` in `channel-tabs.tsx`), so a prop threading "am I visible" could never be false
 * here. Keeping one would read as a safeguard while actually hiding where the gating happens.
 */
export function ChannelThreadList({
    slug,
    kind,
    isOwner,
}: {
    slug: string
    kind: ThreadKind
    isOwner: boolean
}) {
    const { t } = useTranslation()
    const {
        threads,
        isLoading,
        isError,
        isEmpty,
        refetch,
        fetchNextPage,
        hasNextPage,
        isFetchingNextPage,
    } = useChannelThreads({ slug, kind, isOwner })

    /**
     * Premium readers pay nothing to react or reply, and the flag is the **reader's**, not the
     * post's — so it is read here and handed down rather than derived inside `features/post`, which
     * may not import this feature. `replyCost` carries the rule.
     */
    const { isPremium } = useMyChannel()

    /*
     * One share sheet for the whole list, holding whichever post raised it — the same arrangement
     * the home feed uses, and for the same reason: `ShareDialog` mounts a channel list, a link mint
     * and a QR canvas, so one per card would mount twenty to show at most one.
     */
    const [sharing, setSharing] = useState<Post | null>(null)

    /*
     * One viewer for the whole list, so it can page between **posts** — `usePostSlider` carries why
     * the list owns that and the viewer does not. Same arrangement as the share sheet above.
     */
    const slider = usePostSlider(threads, { onLoadMore: fetchNextPage, hasMore: hasNextPage })

    /* A post's id is the row's identity here, where home's is a whole group's. */
    const keys = useMemo(() => threads.map(thread => thread.id), [threads])
    const { observe, heightFor } = useRenderWindow(keys)

    const [sentinelRef, sentinelInView] = useInView<HTMLDivElement>({
        enabled: hasNextPage && !isFetchingNextPage,
    })

    useEffect(() => {
        if (sentinelInView && hasNextPage && !isFetchingNextPage) fetchNextPage()
    }, [sentinelInView, hasNextPage, isFetchingNextPage, fetchNextPage])

    if (isLoading) return <ThreadListSkeleton kind={kind} />

    if (isError) {
        return (
            <div className="py-6">
                <ChannelError kind="unavailable" onRetry={() => refetch()} />
            </div>
        )
    }

    if (isEmpty) {
        /**
         * The owner and a visitor get different copy, which is legacy's behaviour and worth keeping:
         * "no posts yet" is information to a visitor and a prompt to the owner. The owner's CTA is
         * absent rather than disabled — the composer is `features/post`'s, and a dead button under
         * an encouraging sentence is worse than the sentence alone.
         */
        return (
            <ChannelEmptyState
                icon={kind === 'media' ? 'image-gallery' : 'comment-dots'}
                title={t(
                    isOwner
                        ? kind === 'media'
                            ? 'channel_empty_media_owner'
                            : 'channel_empty_posts_owner'
                        : kind === 'media'
                          ? 'channel_empty_media_viewer'
                          : 'channel_empty_posts_viewer',
                )}
                /*
                 * The viewer's posts state carries legacy's second line
                 * (`vs_not_following_w2_check_back_soon…`). The owner's does not: their copy is
                 * already a two-clause prompt, and the visitor's is an observation that benefits
                 * from the nudge to come back.
                 */
                body={
                    !isOwner && kind === 'posts' ? t('channel_empty_posts_viewer_body') : undefined
                }
            />
        )
    }

    return (
        <div className="flex min-w-0 flex-col gap-3">
            {kind === 'media' ? (
                // Three across and gap-1, matching legacy's grid. 21 per page is seven full rows.
                <div className="grid grid-cols-3 gap-1">
                    {threads.map(thread => (
                        <ChannelMediaTile key={thread.id} post={thread} />
                    ))}
                </div>
            ) : (
                /*
                 * Windowed, for the reason `useRenderWindow` states: a space with a long history
                 * is the same unbounded list home is, and a `PostCard` is the same expensive row.
                 * The **media** grid above is not windowed — a tile is one `next/image` in a fixed
                 * cell, so the DOM it accumulates is a fraction of a card's and the grid's own
                 * three-column layout is what a stood-down cell would have to reproduce.
                 */
                threads.map((thread, index) => {
                    const height = heightFor(thread.id)
                    return (
                        <div
                            key={thread.id}
                            ref={observe}
                            {...windowKeyProps(thread.id)}
                            className="min-w-0"
                            style={height === null ? undefined : { height }}
                        >
                            {height === null ? (
                                <PostCard
                                    post={thread}
                                    isPremiumReader={isPremium}
                                    onShare={() => setSharing(thread)}
                                    onOpenMedia={target => slider.openAt(index, target)}
                                    onChanged={() => refetch()}
                                    testId="channel-thread"
                                />
                            ) : null}
                        </div>
                    )
                })
            )}

            {/* Zero-height, so it never adds space to a list that has stopped growing. */}
            {hasNextPage && <div ref={sentinelRef} aria-hidden="true" className="h-px w-full" />}

            {isFetchingNextPage && (
                <ThreadListSkeleton kind={kind} rows={kind === 'media' ? 3 : 1} />
            )}

            {slider.post && (
                <PostMediaLightbox
                    images={slider.post.images ?? []}
                    video={slider.open?.target === 'video' ? slider.post.video : null}
                    startIndex={typeof slider.open?.target === 'number' ? slider.open.target : 0}
                    post={slider.post}
                    isPremiumReader={isPremium}
                    onShare={() => setSharing(slider.post)}
                    onPrevPost={slider.prev}
                    onNextPost={slider.next}
                    positionLabel={slider.positionLabel}
                    onClose={slider.close}
                />
            )}

            {sharing && (
                <ShareDialog
                    open
                    onOpenChange={open => {
                        if (!open) setSharing(null)
                    }}
                    url={sharing.shareable_url ?? ''}
                    title={sharing.text}
                    image={sharing.cover_image?.uri ?? sharing.images?.[0]?.uri ?? null}
                    context={postShareContext(sharing, 'space')}
                />
            )}
        </div>
    )
}

/**
 * The list's loading shape — the same geometry as the real rows, for the same reason
 * `channel-header-skeleton` reserves its rows: a placeholder shorter than what replaces it makes the
 * page jump.
 */
/**
 * Stable ids for the placeholder rows.
 *
 * The rows have no identity of their own — they are a fixed-length ornament, never reordered — but
 * `key={index}` still trips `noArrayIndexKey`, and suppressing a rule is worse than not needing it.
 */
const SKELETON_IDS = Array.from({ length: 24 }, (_, index) => `skeleton-${index}`)

function ThreadListSkeleton({ kind, rows = 3 }: { kind: ThreadKind; rows?: number }) {
    if (kind === 'media') {
        return (
            <div className="grid grid-cols-3 gap-1">
                {SKELETON_IDS.slice(0, rows * 3).map((id, index) => (
                    <Skeleton
                        key={id}
                        h="auto"
                        className="aspect-square w-full rounded-none"
                        delay={(index % 3) * 160}
                    />
                ))}
            </div>
        )
    }
    return (
        <div className="flex flex-col gap-3">
            {SKELETON_IDS.slice(0, rows).map((id, index) => (
                <div
                    key={id}
                    className={cn(
                        'flex items-center gap-3 rounded-[var(--radius-lg)] bg-(--background-surface) p-3',
                    )}
                >
                    <Skeleton w={40} h={40} className="rounded-[var(--radius-md)]" />
                    <div className="flex min-w-0 flex-1 flex-col gap-2">
                        <div className="flex h-[21px] items-center">
                            <Skeleton w="60%" delay={index * 160} />
                        </div>
                        <div className="flex h-[18px] items-center">
                            <Skeleton w="30%" delay={index * 160} />
                        </div>
                    </div>
                </div>
            ))}
        </div>
    )
}
