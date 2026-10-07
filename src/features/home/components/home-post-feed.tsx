'use client'

import { useMyChannel } from '@features/channel'
import { type Post, PostCard, PostSlider, usePostSlider } from '@features/post'
import { postShareContext, ShareDialog } from '@features/share'
import { useInView } from '@shared/hooks/use-in-view'
import { useRenderWindow, windowKeyProps } from '@shared/hooks/use-render-window'
import { RISE, riseDelay } from '@shared/lib/motion'
import { subTestId } from '@shared/lib/test-id'
import { cn } from '@shared/lib/utils'
import { Skeleton } from '@shared/ui/skeleton'
import { useEffect, useMemo, useState } from 'react'
import { useHomeFeed } from '../hooks/use-home-feed'
import { groupKey, visiblePosts } from '../lib/post-groups'
import { HomeEmptyState } from './home-empty-state'

/** Groups past this many arrive together — see `HomeLiveFeed`'s constant of the same name. */
const STAGGERED = 6

/**
 * The Posts tab — the first real consumer of `PostCard`.
 *
 * ## One hairline between cards, and it is a gap rather than a border
 *
 * Legacy stacks the feed with `gap: 1px` over a `#f4f4f4` background, so the page colour showing
 * through *is* the separator. Kept, because it is what makes a card a full-bleed band: `PostCard`
 * draws no frame of its own (its own header says why), so a border here would be the only edge in
 * the stack and would have to be suppressed on the last row. A gap needs no such exception.
 *
 * The surface is the card's, the page colour is the gap's — which is `docs/DESIGN_SYSTEM.md` §6's
 * "blocks that are full-bleed carry their own edges" read from the other side.
 *
 * **From `md` a group becomes a card**: 16px radius, 12 apart, 24 below the tab row — Figma's
 * `Content` / `Post` frames in `Live Display Improvements`, which float white cards on the page
 * colour exactly as legacy's desktop feed does. Below `md` it stays the band: a 16px radius on a
 * 390px-wide edge-to-edge strip reads as a mistake, not a card.
 *
 * ## Entrance
 *
 * Each group rises in (`RISE`) as it mounts, the first screenful staggered by `riseDelay` so the
 * feed lands as a sequence rather than a slab. The wrapper the window observes is the element that
 * animates, and it never remounts — windowing only empties it — so a card scrolled back into view
 * does not rise a second time. `translate` and `opacity` only, so nothing the window measures moves.
 *
 * ## The sentinel and `needsMore` are the same request
 *
 * One is geometry (the reader is approaching the end) and one is arithmetic (a page arrived and
 * collapsed into too few cards to scroll at all — see `useHomeFeed`). Both mean "ask for the next
 * page", so both call it, and both are gated on `hasNextPage` so a short feed stops.
 *
 * `useInView` leads by `600px`, about a screen, so the next page is in flight before the last card
 * scrolls up — a loader that fires only once visible always reads as slowness.
 *
 * ## Grouping is presentation and lives entirely in the hook
 *
 * This component renders whatever `groups` it is handed and asks `visiblePosts` what to draw. It
 * does not know the five-minute rule, and the *See more* it passes to the collapsed card is the
 * hook's `toggleGroup` — legacy routes the same press through a global event emitter and a
 * `findIndex` over the feed, which is two moving parts for a local toggle.
 */
export function HomePostFeed({ testId = 'home-feed' }: { testId?: string }) {
    const {
        groups,
        expanded,
        toggleGroup,
        hideChannel,
        isLoading,
        isError,
        isEmpty,
        isSignedOut,
        refetch,
        fetchNextPage,
        hasNextPage,
        isFetchingNextPage,
        needsMore,
    } = useHomeFeed()

    /**
     * Premium readers pay nothing to react or reply, and the flag is the **reader's**, not the
     * post's — so it is read here and handed down rather than derived inside `features/post`, which
     * may not import this feature. `replyCost` carries the rule.
     */
    const { isPremium } = useMyChannel()

    /**
     * The share sheet is **one dialog for the whole feed**, holding whichever post raised it.
     *
     * Not one per card: `ShareDialog` mounts a channel list, a link mint and a QR canvas, and a feed
     * of thirty cards would mount thirty of them to show at most one. The card takes `onShare` as a
     * prop for exactly this reason — it does not import `features/share` at all, so where the sheet
     * lives is the feed's decision rather than the card's.
     */
    const [sharing, setSharing] = useState<Post | null>(null)

    /*
     * Keys in list order — what the window turns a visibility change into a position with. Derived
     * rather than built inside the hook so the hook stays list-agnostic: `ChannelThreadList` wants
     * the same behaviour over rows that are posts rather than groups.
     */
    /**
     * The feed as one flat list of the posts actually **drawn**, for the media viewer.
     *
     * Not `groups.flatMap(g => g.posts)`: a collapsed group draws one card and hides three, and a
     * viewer that paged into a post the reader cannot see on the page behind it would be showing
     * them something they never chose. `visiblePosts` is the same function the rows use, so the two
     * cannot disagree — and pressing *See more* re-flattens, which is correct rather than a bug.
     */
    const flatPosts = useMemo(
        () => groups.flatMap(group => visiblePosts(group, expanded.has(groupKey(group)))),
        [groups, expanded],
    )
    const slider = usePostSlider(flatPosts)

    const keys = useMemo(() => groups.map(groupKey), [groups])
    const { observe, heightFor } = useRenderWindow(keys)

    const [sentinelRef, sentinelInView] = useInView<HTMLDivElement>({
        enabled: hasNextPage && !isFetchingNextPage,
    })

    useEffect(() => {
        if (sentinelInView && hasNextPage && !isFetchingNextPage) fetchNextPage()
    }, [sentinelInView, hasNextPage, isFetchingNextPage, fetchNextPage])

    // The arithmetic half: a page that collapsed into too few cards to scroll leaves the sentinel
    // off screen forever, so nothing would ever ask for the page that would fix it.
    useEffect(() => {
        if (needsMore) fetchNextPage()
    }, [needsMore, fetchNextPage])

    if (isSignedOut) return <HomeEmptyState kind="signed-out" />
    if (isLoading) return <FeedSkeleton />
    if (isError) return <HomeEmptyState kind="error" onRetry={() => refetch()} />
    if (isEmpty) return <HomeEmptyState kind="empty" />

    return (
        <div data-testid={testId} className="flex min-w-0 flex-col gap-px md:gap-3 md:py-6">
            {groups.map((group, index) => {
                const key = groupKey(group)
                const height = heightFor(key)
                const posts = visiblePosts(group, expanded.has(key))
                const collapsed = posts.length < group.posts.length

                /*
                 * The **group** is the wrapper the window observes, not the card, because the group
                 * is what the key identifies and what collapses as one unit. A collapsed group
                 * draws one card and an expanded one draws four; observing cards would mean the
                 * measured height stopped matching the moment the reader pressed *See more*.
                 */
                return (
                    <div
                        key={key}
                        ref={observe}
                        {...windowKeyProps(key)}
                        className={cn(
                            // `overflow-clip`, not `-hidden`: the card must not become a scrollport
                            // under the sticky tab row (`docs/DESIGN_SYSTEM.md` §6).
                            'flex min-w-0 flex-col gap-px bg-(--background-surface) md:overflow-clip md:rounded-2xl',
                            RISE,
                        )}
                        /*
                         * Held open at the height it had, so nothing below it moves. Drawn empty
                         * rather than as a skeleton: it is off screen by definition, and an
                         * animating placeholder is paint work in the one place built to avoid it.
                         */
                        style={{
                            ...(index < STAGGERED ? riseDelay(index) : undefined),
                            ...(height === null ? undefined : { height }),
                        }}
                    >
                        {height === null
                            ? posts.map((post, positionInGroup) => (
                                  <PostCard
                                      key={post.id}
                                      post={post}
                                      isPremiumReader={isPremium}
                                      /*
                                       * Only the **last drawn card of a collapsed group** offers
                                       * See more. On a collapsed group that is the only card; the
                                       * guard is what stops a three-post group — which is drawn
                                       * whole — from growing a control that would reveal nothing.
                                       */
                                      onSeeMore={
                                          collapsed && positionInGroup === posts.length - 1
                                              ? () => toggleGroup(key)
                                              : undefined
                                      }
                                      onShare={() => setSharing(post)}
                                      /*
                                       * The index is into the **flat** list, found by identity —
                                       * a group's own position is not the viewer's, and a post
                                       * appears once in either.
                                       */
                                      onOpenMedia={target =>
                                          slider.openAt(
                                              flatPosts.findIndex(
                                                  candidate => candidate.id === post.id,
                                              ),
                                              target,
                                          )
                                      }
                                      onChanged={() => refetch()}
                                      onAuthorBlocked={hideChannel}
                                      testId={subTestId(testId, 'item')}
                                  />
                              ))
                            : null}
                    </div>
                )
            })}

            {/* Zero-height, so it never adds space to a list that has stopped growing. */}
            {hasNextPage && <div ref={sentinelRef} aria-hidden="true" className="h-px w-full" />}

            {isFetchingNextPage && <FeedSkeleton rows={1} className="md:py-0" />}

            {/*
             * Rendered only while a post is selected, so a feed nobody shares from mounts nothing.
             * `url` falls back to empty rather than the sheet being withheld: a post with no
             * `shareable_url` is ordinary for a few seconds after posting, and the sheet's own rows
             * already degrade to the URL they were given.
             */}

            {slider.open && (
                <PostSlider
                    posts={flatPosts}
                    index={slider.open.index}
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
                    context={postShareContext(sharing, 'home')}
                />
            )}
        </div>
    )
}

/**
 * The loading shape, and it is the **card's** shape rather than a generic block.
 *
 * A skeleton that does not match what replaces it produces a jump at the moment the content lands,
 * which is the one moment the reader is looking. Avatar, two lines of meta, a paragraph, a 16/9
 * media box, an action row.
 */
function FeedSkeleton({ rows = 3, className }: { rows?: number; className?: string }) {
    return (
        <div className={cn('flex flex-col gap-px md:gap-3 md:py-6', className)} aria-busy="true">
            {Array.from({ length: rows }, (_, index) => (
                <div
                    // Skeletons have no identity beyond their position, and this list never
                    // reorders — it is replaced wholesale by the real cards.
                    // biome-ignore lint/suspicious/noArrayIndexKey: position is the only identity a placeholder has.
                    key={index}
                    className="flex flex-col gap-3 bg-(--background-surface) px-3 py-3 md:rounded-2xl md:px-6 md:py-5"
                >
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
            ))}
        </div>
    )
}
