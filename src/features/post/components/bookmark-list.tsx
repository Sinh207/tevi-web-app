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
import { useBookmarks } from '../hooks/use-bookmarks'
import { usePostSlider } from '../hooks/use-post-slider'
import { PostCard } from './post-card'
import { PostSlider } from './post-slider'

/**
 * `/bookmarks` — every post the reader has saved.
 *
 * ## The same list the feed is, and it has to be
 *
 * `PostCard`, one share sheet for the whole list, a sentinel that asks for the next page, and
 * `useRenderWindow` over the rows. That last one is not decoration on this screen: a bookmark list
 * is the one place in the product where a reader accumulates rows on purpose and over years, so it
 * is the *most* unbounded list here, not the least. Its own hook writes down what a `PostCard`
 * costs to keep mounted.
 *
 * **Ten rows in the DOM at a time** is `useRenderWindow`'s `minimum`, which is also what home and a
 * space's thread list use. Rows outside the window are stood down to a box of the height they had —
 * measured first, so nothing above the reader collapses and moves the page under them.
 *
 * ## Unbookmarking here removes the row, and the card cannot know that
 *
 * The toggle on each card is `usePostBookmark`'s, the same one every other surface uses. What this
 * screen adds is `onChanged`, which refetches — a post unbookmarked from a feed stays where it is,
 * and a post unbookmarked *here* has just left the list it is in. That difference belongs to the
 * list, which is why the card takes a callback rather than knowing about bookmarks at all.
 *
 * ## Two props, for the boundary
 *
 * `isPremiumReader` and the empty state's action come from the caller. Premium is
 * `features/premium` through `features/channel`, and both import this feature — the same reason the
 * composer takes its author as a prop. `app/` composes.
 */
export function BookmarkList({
    isPremiumReader = false,
    onSignIn,
    testId = 'post-bookmarks',
}: {
    /** Premium readers are exempt from paid interaction — read by the host, not here. */
    isPremiumReader?: boolean
    /** A guest pressed the sign-in prompt. Absent, the prompt is a sentence with no button. */
    onSignIn?: () => void
    testId?: string
}) {
    const { t } = useTranslation()
    const {
        posts,
        isLoading,
        isError,
        isEmpty,
        isSignedOut,
        refetch,
        hasNextPage,
        isFetchingNextPage,
        loadMore,
    } = useBookmarks()

    /* One share sheet for the whole list — see `channel-thread-list.tsx` for what one per card costs. */
    const [sharing, setSharing] = useState<Post | null>(null)

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

    if (isSignedOut) {
        return (
            <BookmarkNotice
                icon="bookmark-simple"
                title={t('bookmarks_signed_out')}
                action={onSignIn ? { label: t('auth_sign_in'), onPress: onSignIn } : undefined}
                testId={testId}
            />
        )
    }

    if (isLoading) return <BookmarkSkeleton testId={testId} />

    if (isError) {
        return (
            <BookmarkNotice
                icon="bookmark-simple"
                title={t('bookmarks_error')}
                action={{ label: t('common_retry'), onPress: refetch }}
                testId={testId}
            />
        )
    }

    if (isEmpty) {
        return (
            <BookmarkNotice
                icon="bookmark-simple"
                title={t('bookmarks_empty')}
                body={t('bookmarks_empty_body')}
                testId={testId}
            />
        )
    }

    return (
        <div data-testid={testId} className="flex min-w-0 flex-col gap-px">
            {posts.map((post, index) => {
                const height = heightFor(post.id)
                return (
                    <div
                        key={post.id}
                        ref={observe}
                        {...windowKeyProps(post.id)}
                        className="min-w-0 bg-(--background-surface)"
                        /*
                         * Held open at the height it had. Drawn empty rather than as a skeleton:
                         * it is off screen by definition, and an animating placeholder is paint
                         * work in the one place built to avoid paint work.
                         */
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

            {isFetchingNextPage ? <BookmarkSkeleton rows={1} testId={testId} /> : null}

            {slider.open ? (
                <PostSlider
                    posts={slider.slides}
                    index={slider.open.index}
                    media={slider.open.media}
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
                    /* `bookmarks` is where the share came from — the analytics field, not a route. */
                    context={postShareContext(sharing, 'bookmarks')}
                />
            ) : null}
        </div>
    )
}

/** A whole screen's worth of card-shaped placeholders, or one when a page is on its way in. */
function BookmarkSkeleton({ rows = 3, testId }: { rows?: number; testId?: string }) {
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
 * The three states that are not a list: signed out, failed, and empty.
 *
 * One component because they differ only in words and in whether there is a button — three
 * near-identical blocks is three places for the panel's own geometry to drift, which
 * `DESIGN_SYSTEM.md` §6 already has this repo's list of.
 */
function BookmarkNotice({
    icon,
    title,
    body,
    action,
    testId,
}: {
    icon: 'bookmark-simple'
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
            <Icon name={icon} size={32} className="text-(--icon-disabled)" />
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
