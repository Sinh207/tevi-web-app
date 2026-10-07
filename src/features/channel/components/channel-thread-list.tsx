'use client'

import {
    type Post,
    PostCard,
    PostMediaTile,
    PostSlider,
    SpaceCollectionsRow,
    usePostSlider,
} from '@features/post'
import { postShareContext, ShareDialog } from '@features/share'
import { useInView } from '@shared/hooks/use-in-view'
import { useRenderWindow, windowKeyProps } from '@shared/hooks/use-render-window'
import { useTranslation } from '@shared/i18n/use-translation'
import { cn } from '@shared/lib/utils'
import { Icon } from '@shared/ui/icon'
import { Skeleton } from '@shared/ui/skeleton'
import { memo, type RefCallback, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ThreadKind } from '../api/channel-api'
import { useChannelThreads } from '../hooks/use-channel-threads'
import { usePinnedThreads } from '../hooks/use-pinned-threads'
import { CHANNEL_PADDING_BLEED } from '../lib/container'
import { useMyChannel } from '../providers/my-channel-provider'
import { ChannelEmptyState } from './channel-empty-state'
import { ChannelError } from './channel-error'
import { WhatsNewBar } from './whats-new-bar'

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

    /*
     * The pinned post lives in its own request — the list above asks for `pinned: 0` — and is drawn
     * above the list under a *Pinned* heading, legacy's `TabPost` / `PostPinned`. Posts tab only:
     * legacy's media grid does not lift a pin out either.
     */
    const {
        pinned,
        isLoading: pinnedLoading,
        refetch: refetchPinned,
    } = usePinnedThreads({ slug, isOwner, enabled: kind === 'posts' })

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
    const slider = usePostSlider(threads, { mixed: kind === 'media' })

    /* A post's id is the row's identity here, where home's is a whole group's. */
    const keys = useMemo(() => threads.map(thread => thread.id), [threads])
    const { observe, heightFor, shouldRender } = useRenderWindow(
        keys,
        kind === 'media' ? MEDIA_WINDOW : undefined,
    )

    const [sentinelRef, sentinelInView] = useInView<HTMLDivElement>({
        enabled: hasNextPage && !isFetchingNextPage,
    })

    useEffect(() => {
        if (sentinelInView && hasNextPage && !isFetchingNextPage) fetchNextPage()
    }, [sentinelInView, hasNextPage, isFetchingNextPage, fetchNextPage])

    /*
     * Stable, because `ThreadRow` is memoised: the window moves its span every time a row crosses
     * the viewport edge, and with an inline closure here every mounted `PostCard` re-rendered with
     * it. `HomePostFeed` carries the measurement.
     */
    const onChanged = useCallback(() => {
        /*
         * Both lists, every time: pinning moves a post from one to the other — and replaces the
         * space's previous pin, which moves back — so refetching only the list the press came
         * from leaves the post drawn twice or not at all.
         */
        refetch()
        refetchPinned()
    }, [refetch, refetchPinned])
    // Through a ref: `openAt` closes over the list, so it changes on every append — `HomePostFeed`
    // carries the reasoning.
    const openAt = useRef(slider.openAt)
    openAt.current = slider.openAt
    const openMedia = useCallback(
        (index: number, target: number | 'video') => openAt.current(index, target),
        [],
    )

    /*
     * The owner's *What's new?* bar, Posts tab only — legacy's creator `TabPost` draws `WhatNew`
     * after the collections row and before the pinned post, and in **every** state, an empty space
     * included: that is where an invitation to post matters most. Full-bleed like the post strip it
     * heads, so it reads as the strip's first row rather than as a card inside the panel.
     *
     * **A hairline above it**, and below it before a non-list state. Legacy's tab is a `gap: 1px`
     * stack over `#f4f4f4`, so the collections row, the bar and the first post are each separated
     * by a line of page colour; without one, the bar ran into the *Manage collections* row as if
     * the two were one block. Same mechanism as the strip below — the page colour showing through
     * a 1px inset — rather than a border, so every separator in the tab is the same line.
     */
    const whatsNew = kind === 'posts' && isOwner ? <WhatsNewBar testId="channel-composer" /> : null
    const withWhatsNew = (state: React.ReactNode) =>
        whatsNew ? (
            <div className="flex min-w-0 flex-col gap-3">
                <div className={cn('bg-(--background) py-px', CHANNEL_PADDING_BLEED)}>
                    {whatsNew}
                </div>
                {state}
            </div>
        ) : (
            state
        )

    // Both, as legacy's `isLoadingInit` does: a pin landing after the list would push every row down.
    if (isLoading || (kind === 'posts' && pinnedLoading)) {
        return withWhatsNew(<ThreadListSkeleton kind={kind} />)
    }

    if (isError) {
        return withWhatsNew(
            <div className="py-6">
                <ChannelError kind="unavailable" onRetry={() => refetch()} />
            </div>,
        )
    }

    if (isEmpty && pinned.length === 0) {
        /**
         * The owner and a visitor get different copy, which is legacy's behaviour and worth keeping:
         * "no posts yet" is information to a visitor and a prompt to the owner. The owner's way to
         * act on it is the *What's new?* bar above (`withWhatsNew`), not a button in here.
         */
        return withWhatsNew(
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
            />,
        )
    }

    return (
        <div className="flex min-w-0 flex-col gap-3">
            {/*
             * Above the posts, and only once there are posts — legacy's `!hasNoData` on both the
             * creator's and the visitor's tab. Inside the list's state machine for that reason: an
             * empty space's "no posts yet" is the whole message, and a row of chips over it would
             * be filing for a space with nothing filed.
             */}
            {kind === 'posts' ? <SpaceCollectionsRow slug={slug} isOwner={isOwner} /> : null}
            {kind === 'media' ? (
                // Three across and gap-1, matching legacy's grid. 21 per page is seven full rows.
                <div className="grid grid-cols-3 gap-1">
                    {threads.map((thread, index) => (
                        /*
                         * Windowed like the posts list below, and like legacy's grid
                         * (`useInView(24)` + `isIndexInRender`). The cell is what stays mounted:
                         * it is `aspect-square` in a three-column track, so a stood-down tile
                         * keeps its exact box from the grid alone — no measured height to hold
                         * open, and the rows below never move.
                         */
                        <div
                            key={thread.id}
                            ref={observe}
                            {...windowKeyProps(thread.id)}
                            className="aspect-square min-w-0"
                        >
                            {shouldRender(thread.id) ? (
                                <PostMediaTile
                                    post={thread}
                                    onOpenMedia={target => slider.openAt(index, target)}
                                    onChanged={() => refetch()}
                                    className="size-full"
                                    testId="channel-media"
                                />
                            ) : null}
                        </div>
                    ))}
                </div>
            ) : (
                /*
                 * ## One hairline between posts, and it is a gap rather than a border
                 *
                 * Home's arrangement and legacy's own (`gap: '1px'` over `#f4f4f4`): the rows are
                 * `--background-surface`, the strip behind them is the page colour, and the page
                 * colour showing through the 1px gap *is* the line. `PostCard` draws no frame of
                 * its own, so a border here would be the only edge in the stack and would need
                 * suppressing on the last row; a gap needs no such exception.
                 *
                 * The strip paints `--background` itself rather than relying on what is behind it,
                 * because here there is nothing behind it: the tab panel is `--background-surface`,
                 * so card and page were the same colour and two posts ran together with no visible
                 * boundary at all — which is what this fixes.
                 *
                 * And it is `CHANNEL_PADDING_BLEED`-wide, because the strip has to reach both edges
                 * to read as a separator rather than as a notch. `PostCard` brings its own
                 * `px-3 md:px-6`, so cancelling the panel's sides also stops the content being
                 * indented twice — see that constant.
                 */
                <div
                    className={cn(
                        'flex min-w-0 flex-col gap-px bg-(--background)',
                        CHANNEL_PADDING_BLEED,
                        // The line above the *What's new?* bar — see `whatsNew`.
                        whatsNew && 'pt-px',
                    )}
                >
                    {/*
                     * Windowed, for the reason `useRenderWindow` states: a space with a long
                     * history is the same unbounded list home is, and a `PostCard` is the same
                     * expensive row.
                     */}
                    {whatsNew}
                    {kind === 'posts' && pinned.length > 0 ? (
                        <PinnedThreads
                            posts={pinned}
                            isPremium={isPremium}
                            onShare={setSharing}
                            onChanged={onChanged}
                        />
                    ) : null}
                    {threads.map((thread, index) => (
                        <ThreadRow
                            key={thread.id}
                            thread={thread}
                            index={index}
                            height={heightFor(thread.id)}
                            observe={observe}
                            isPremium={isPremium}
                            onShare={setSharing}
                            onOpenMedia={openMedia}
                            onChanged={onChanged}
                        />
                    ))}
                </div>
            )}

            {/* Zero-height, so it never adds space to a list that has stopped growing. */}
            {hasNextPage && <div ref={sentinelRef} aria-hidden="true" className="h-px w-full" />}

            {isFetchingNextPage && (
                <ThreadListSkeleton kind={kind} rows={kind === 'media' ? 3 : 1} />
            )}

            {slider.open && (
                <PostSlider
                    posts={slider.slides}
                    index={slider.open.index}
                    media={slider.open.media}
                    onIndexChange={slider.goTo}
                    onLoadMore={fetchNextPage}
                    hasMore={hasNextPage}
                    isPremiumReader={isPremium}
                    onShare={setSharing}
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
 * The render window for the Media grid, counted in **tiles**, not rows.
 *
 * The hook's defaults are sized for a feed of cards, one per row: a 10-item floor and 4 items of
 * overscan. In a three-wide grid that is barely three rows mounted and one row of overscan, so a
 * flick paints empty cells. Legacy's grid keeps 24 (eight rows); overscan is three rows either
 * side. Both multiples of three, so the window never cuts a row in half.
 */
const MEDIA_WINDOW = { minimum: 24, overscan: 9 }

/**
 * The space's pinned post, above the list — legacy's `PostPinned`: a thumbtack and *Pinned* in
 * 14/500 subtitle ink (`12 12 8` / `24 24 8` around it), then the card with **no top padding**
 * and 24 below, so the heading reads as the card's own first line.
 *
 * The heading is what says "pinned"; the card itself draws no marker. Not windowed — it is one
 * post — and it opens media in the card's **own** lightbox rather than the list's slider, whose
 * index counts the list below and not this.
 */
function PinnedThreads({
    posts,
    isPremium,
    onShare,
    onChanged,
}: {
    posts: Post[]
    isPremium: boolean
    onShare: (post: Post) => void
    onChanged: () => void
}) {
    const { t } = useTranslation()
    return (
        <section className="flex min-w-0 flex-col bg-(--background-surface)">
            <h3
                data-testid="channel-pinned-title"
                className="m-0 flex items-center gap-1 px-3 pt-3 pb-2 type-dense-emphasis text-(--text-subtitle) md:px-6 md:pt-6"
            >
                <Icon name="thumbtack" size={16} className="flex-none" />
                {t('post_pinned')}
            </h3>
            {posts.map(post => (
                <PostCard
                    key={post.id}
                    post={post}
                    isPremiumReader={isPremium}
                    onShare={() => onShare(post)}
                    onChanged={onChanged}
                    className="pt-0 pb-6 md:pt-0 md:pb-6"
                    testId="channel-pinned"
                />
            ))}
        </section>
    )
}

/**
 * One post of the list: the wrapper the window observes, and the card while it is mounted.
 *
 * Memoised so a window move re-renders only the rows whose `height` flipped. Every prop is a value
 * or a stable callback; an inline closure passed here would quietly undo that.
 */
const ThreadRow = memo(function ThreadRow({
    thread,
    index,
    height,
    observe,
    isPremium,
    onShare,
    onOpenMedia,
    onChanged,
}: {
    thread: Post
    index: number
    height: number | null
    observe: RefCallback<HTMLElement>
    isPremium: boolean
    onShare: (post: Post) => void
    onOpenMedia: (index: number, target: number | 'video') => void
    onChanged: () => void
}) {
    return (
        <div
            ref={observe}
            {...windowKeyProps(thread.id)}
            className="min-w-0 bg-(--background-surface)"
            style={height === null ? undefined : { height }}
        >
            {height === null ? (
                <PostCard
                    post={thread}
                    isPremiumReader={isPremium}
                    onShare={() => onShare(thread)}
                    onOpenMedia={target => onOpenMedia(index, target)}
                    onChanged={onChanged}
                    testId="channel-thread"
                />
            ) : null}
        </div>
    )
})

/**
 * Stable ids for the placeholder rows.
 *
 * The rows have no identity of their own — they are a fixed-length ornament, never reordered — but
 * `key={index}` still trips `noArrayIndexKey`, and suppressing a rule is worse than not needing it.
 */
const SKELETON_IDS = Array.from({ length: 24 }, (_, index) => `skeleton-${index}`)

/**
 * The list's loading shape — the same geometry as the real rows, for the same reason
 * `channel-header-skeleton` reserves its rows: a placeholder shorter than what replaces it makes the
 * page jump.
 */
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
