'use client'

import { useInView } from '@shared/hooks/use-in-view'
import { useTranslation } from '@shared/i18n/use-translation'
import { cn } from '@shared/lib/utils'
import { Skeleton } from '@shared/ui/skeleton'
import { useEffect } from 'react'
import type { ThreadKind } from '../api/channel-api'
import { useChannelThreads } from '../hooks/use-channel-threads'
import { ChannelEmptyState } from './channel-empty-state'
import { ChannelError } from './channel-error'
import { ChannelMediaPlaceholder, ChannelThreadPlaceholder } from './channel-thread-placeholder'

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
                        <ChannelMediaPlaceholder key={thread.id} />
                    ))}
                </div>
            ) : (
                threads.map(thread => <ChannelThreadPlaceholder key={thread.id} thread={thread} />)
            )}

            {/* Zero-height, so it never adds space to a list that has stopped growing. */}
            {hasNextPage && <div ref={sentinelRef} aria-hidden="true" className="h-px w-full" />}

            {isFetchingNextPage && (
                <ThreadListSkeleton kind={kind} rows={kind === 'media' ? 3 : 1} />
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
