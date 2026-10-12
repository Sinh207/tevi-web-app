'use client'

import { useMyChannel, WhatsNewBar } from '@features/channel'
import { type Post, PostCard, PostSlider, usePostSlider } from '@features/post'
import { postShareContext, ShareDialog } from '@features/share'
import { useInView } from '@shared/hooks/use-in-view'
import { useRenderWindow, windowKeyProps } from '@shared/hooks/use-render-window'
import { useScrollAnchor } from '@shared/hooks/use-scroll-anchor'
import { RISE, riseDelay } from '@shared/lib/motion'
import { subTestId } from '@shared/lib/test-id'
import { cn } from '@shared/lib/utils'
import { Skeleton } from '@shared/ui/skeleton'
import { memo, type RefCallback, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useHomeFeed } from '../hooks/use-home-feed'
import { groupKey, type PostGroup, visiblePosts } from '../lib/post-groups'
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
 * **The band at every width.** From `md` the groups were briefly cards — 16px radius, 12 apart,
 * after Figma's `Content` / `Post` frames — and product asked for them back: no radius and no gap,
 * one hairline between groups as below `md`. What `md` keeps is the 24px under the tab row, which
 * belongs to the tab pill above rather than to the cards.
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
export function HomePostFeed({
    testId = 'home-feed',
    publicFeed = null,
}: {
    testId?: string
    /** The server's anonymous page, for a reader who is not signed in — `useHomeFeed` says why. */
    publicFeed?: readonly Post[] | null
}) {
    const {
        groups,
        expanded,
        toggleGroup,
        hideChannel,
        isLoading,
        isError,
        isEmpty,
        refetch,
        fetchNextPage,
        hasNextPage,
        isFetchingNextPage,
        needsMore,
    } = useHomeFeed({ publicFeed })

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

    /*
     * Back where the reader left the feed when a tab press brings them here — *Back* already does,
     * a push does not; `useScrollAnchor` says why.
     */
    const listRef = useRef<HTMLDivElement>(null)
    const listShown = !isLoading && !isError && !isEmpty
    useScrollAnchor('home-feed', listRef, listShown)

    // The arithmetic half: a page that collapsed into too few cards to scroll leaves the sentinel
    // off screen forever, so nothing would ever ask for the page that would fix it.
    useEffect(() => {
        if (needsMore) fetchNextPage()
    }, [needsMore, fetchNextPage])

    /*
     * Stable, because `FeedGroup` is memoised and these are its props. The window moves its span
     * every time a group crosses the viewport edge — several times a second in a scroll — and each
     * move re-renders this list. With inline closures every mounted `PostCard` re-rendered with it;
     * now only the groups whose `height` actually flipped do. Measured on a 160-post feed scrolled
     * for ten seconds: script time halved.
     */
    /*
     * Through refs, because both change on every append — `openAt` closes over the list — and a
     * handler that changed with them would re-render every group each time a page lands, which
     * `reuseGroups` exists to avoid.
     */
    const openAt = useRef(slider.openAt)
    openAt.current = slider.openAt
    const posts = useRef(flatPosts)
    posts.current = flatPosts
    const openMedia = useCallback(
        (post: Post, target: number | 'video') =>
            // The index is into the **flat** list, found by identity — a group's own position is
            // not the viewer's, and a post appears once in either.
            openAt.current(
                posts.current.findIndex(candidate => candidate.id === post.id),
                target,
            ),
        [],
    )
    const onChanged = useCallback(() => {
        refetch()
    }, [refetch])

    /*
     * *What's new?* heads the tab in **every** state — loading, empty, signed out — as legacy's
     * `WhatNew` does: it is the feed's own invitation to post, and an empty feed is where it matters
     * most. One hairline below it, the same 1px gap that separates the groups.
     *
     * **The two top corners round from `md`** (16px — `xl` in this theme's ramp, where `2xl` is
     * 24), and only those: legacy's desktop feed is one `borderRadius: 16px` box whose first row is
     * this bar, so the bar carries the box's top edge. The groups below stay square — the flat band
     * product asked for. Below `md` the bar runs to both screen edges and a radius there would read
     * as a mistake, as legacy's `matchUpSm` gate also says.
     */
    const whatsNew = <WhatsNewBar testId="home-composer" className="md:rounded-t-xl" />
    if (isLoading) return withWhatsNew(whatsNew, <FeedSkeleton fill />)
    if (isError) {
        return withEmptyPanel(whatsNew, <HomeEmptyState kind="error" onRetry={() => refetch()} />)
    }
    if (isEmpty) return withEmptyPanel(whatsNew, <HomeEmptyState kind="empty" />)

    return (
        <div ref={listRef} data-testid={testId} className={FEED_LIST}>
            {whatsNew}
            {groups.map((group, index) => {
                const key = groupKey(group)
                return (
                    <FeedGroup
                        key={key}
                        group={group}
                        rowKey={key}
                        index={index}
                        expanded={expanded.has(key)}
                        height={heightFor(key)}
                        observe={observe}
                        isPremium={isPremium}
                        onToggle={toggleGroup}
                        onShare={setSharing}
                        onOpenMedia={openMedia}
                        onChanged={onChanged}
                        onAuthorBlocked={hideChannel}
                        testId={testId}
                    />
                )
            })}

            {/* Zero-height, so it never adds space to a list that has stopped growing. */}
            {hasNextPage && <div ref={sentinelRef} aria-hidden="true" className="h-px w-full" />}

            {isFetchingNextPage && <FeedSkeleton rows={1} />}

            {/*
             * Rendered only while a post is selected, so a feed nobody shares from mounts nothing.
             * `url` falls back to empty rather than the sheet being withheld: a post with no
             * `shareable_url` is ordinary for a few seconds after posting, and the sheet's own rows
             * already degrade to the URL they were given.
             */}

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
                    context={postShareContext(sharing, 'home')}
                />
            )}
        </div>
    )
}

/**
 * The feed's stack, in every state: the *What's new?* bar and the groups as one hairline band,
 * no radius and no gap between them (see the header), 24px under the tab row from `md`.
 */
const FEED_LIST = 'flex min-w-0 flex-col gap-px md:py-6'

/**
 * The bar above a feed with **nothing to list** — empty, signed out, failed — as one surface.
 *
 * The state sits in a white panel under the bar, one hairline below it — the same 1px of page colour
 * that separates every row of this feed — so the screen reads as one card rather than a white bar
 * over a state floating on the page colour (which is how it first shipped: the state sat under the
 * bar, flush to it, on grey). The panel takes the rest of
 * the column (`flex-1`, through `HomeView`'s stretched panel — never a viewport `min-height`, which
 * `(main)/layout.tsx` explains) and centres the state in it, as legacy's `NoPost` sits in the middle
 * of its screen. From `md` its bottom corners round to meet the bar's top ones: one 16px card.
 */
function withEmptyPanel(bar: React.ReactNode, state: React.ReactNode) {
    return (
        <div className="flex min-w-0 flex-1 flex-col gap-px md:py-6">
            {bar}
            <div className="flex flex-1 flex-col items-center justify-center bg-(--background-surface) md:rounded-b-xl">
                {state}
            </div>
        </div>
    )
}

/**
 * The bar above the loading skeleton, a hairline apart. Stretched (`flex-1`) and with no bottom
 * inset, so the skeleton below can take the rest of the column down to the screen's edge.
 */
function withWhatsNew(bar: React.ReactNode, state: React.ReactNode) {
    return (
        <div className={cn(FEED_LIST, 'flex-1 md:pb-0')}>
            {bar}
            {state}
        </div>
    )
}

/**
 * One group of the feed: the wrapper the window observes, and its cards when it is mounted.
 *
 * Memoised so a window move re-renders only the groups it changes — see the handlers in
 * `HomePostFeed`. Every prop is a value or a stable callback; an inline closure passed here would
 * quietly undo that.
 */
const FeedGroup = memo(function FeedGroup({
    group,
    rowKey,
    index,
    expanded,
    height,
    observe,
    isPremium,
    onToggle,
    onShare,
    onOpenMedia,
    onChanged,
    onAuthorBlocked,
    testId,
}: {
    group: PostGroup
    rowKey: string
    /** Position in the feed — only the first `STAGGERED` rise in sequence. */
    index: number
    expanded: boolean
    height: number | null
    observe: RefCallback<HTMLElement>
    isPremium: boolean
    onToggle: (key: string) => void
    onShare: (post: Post) => void
    onOpenMedia: (post: Post, target: number | 'video') => void
    onChanged: () => void
    onAuthorBlocked: (channelId: string) => void
    testId: string
}) {
    const posts = visiblePosts(group, expanded)
    const collapsed = posts.length < group.posts.length

    /*
     * The **group** is the wrapper the window observes, not the card, because the group
     * is what the key identifies and what collapses as one unit. A collapsed group
     * draws one card and an expanded one draws four; observing cards would mean the
     * measured height stopped matching the moment the reader pressed *See more*.
     */
    return (
        <div
            ref={observe}
            {...windowKeyProps(rowKey)}
            /*
             * ⚠ **No background on the group — the cards carry it.** The hairline between two
             * posts is the page colour showing through a 1px gap, and inside a group that gap
             * is this element's own: painted surface here, it showed white, so two posts from
             * one space ran together while the line between two *groups* was there. Legacy's
             * `PostsWrapper` is the same `gap: 1px` with no fill, for the same reason.
             *
             * **Except while stood down.** The empty box then has no cards to carry a surface, so
             * it showed the page colour — near-black in Dark — and a fast flick that outran the
             * window scrolled in as black slabs. Stood down it has no inner gap to protect, so it
             * takes the cards' surface: at worst the reader sees a blank card, never a hole.
             */
            className={cn(
                'flex min-w-0 flex-col gap-px',
                height !== null && 'bg-(--background-surface)',
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
                                  ? () => onToggle(rowKey)
                                  : undefined
                          }
                          onShare={() => onShare(post)}
                          onOpenMedia={target => onOpenMedia(post, target)}
                          onChanged={onChanged}
                          onAuthorBlocked={onAuthorBlocked}
                          eagerMedia={index === 0 && positionInGroup === 0}
                          className="bg-(--background-surface)"
                          testId={subTestId(testId, 'item')}
                      />
                  ))
                : null}
        </div>
    )
})

/**
 * The loading shape, and it is the **card's** shape rather than a generic block.
 *
 * A skeleton that does not match what replaces it produces a jump at the moment the content lands,
 * which is the one moment the reader is looking. So every row is `PostCard`'s own geometry, part for
 * part: the 40px avatar beside a 21px name row and an 18px meta row (time · audience glyph), the
 * kebab at the trailing edge, the caption in 21px lines, the media at 8px radius, and the 36/40px
 * action row — react and comment leading, send / bookmark / share trailing. The paddings are the
 * card's (`px-3 md:px-6`, the action row `md:px-4`) so nothing shifts sideways either.
 *
 * Rows **vary** — clip, text-only, photo — because a feed does, and three identical slabs read as
 * a pattern rather than as posts on their way.
 *
 * ## `fill` — as many rows as the screen is tall, decided by CSS
 *
 * A fixed count is wrong at one end or the other: three cards cover a phone and leave the bottom
 * half of a 1440p monitor as bare page colour. Counting from `window.innerHeight` would need the
 * viewport during the server render, which is a hydration mismatch. Instead `fill` draws more rows
 * than any screen needs and the box takes **the column's remaining height and clips the rest**:
 * `basis-0 grow min-h-0` makes its height the free space (its content contributes none), the same
 * stretched chain `withEmptyPanel` centres its state in. The floor keeps one card visible should a
 * parent ever stop stretching.
 */
function FeedSkeleton({
    rows = 3,
    fill = false,
    className,
}: {
    rows?: number
    /** Fill the column's remaining height instead of drawing exactly `rows` — see above. */
    fill?: boolean
    className?: string
}) {
    return (
        <div
            className={cn(
                'flex flex-col gap-px',
                fill && 'min-h-[420px] grow basis-0 overflow-hidden',
                className,
            )}
            aria-busy="true"
        >
            {Array.from({ length: fill ? FILL_ROWS : rows }, (_, index) => (
                // Skeletons have no identity beyond their position, and this list never
                // reorders — it is replaced wholesale by the real cards.
                <PostCardSkeleton
                    // biome-ignore lint/suspicious/noArrayIndexKey: position is the only identity a placeholder has.
                    key={index}
                    variant={SKELETON_VARIANTS[index % 3]}
                    index={index}
                />
            ))}
        </div>
    )
}

/** Past the tallest screen at the shortest card — the rest is clipped, never laid out visibly. */
const FILL_ROWS = 8

type SkeletonVariant = { lines: string[]; media: string | null }

const SKELETON_VARIANTS: readonly SkeletonVariant[] = [
    { lines: ['92%', '64%'], media: 'aspect-video' },
    { lines: ['100%', '96%', '40%'], media: null },
    { lines: ['72%'], media: 'aspect-[4/3]' },
]

function PostCardSkeleton({ variant, index }: { variant: SkeletonVariant; index: number }) {
    // The DS staggers siblings by 160ms; per card, so the stack breathes top to bottom.
    const delay = (index % 4) * 160
    return (
        <div className="flex w-full min-w-0 flex-none flex-col gap-2 bg-(--background-surface) py-3 md:py-5">
            <div className="flex items-center justify-between gap-2 px-3 md:px-6">
                <div className="flex min-w-0 items-center gap-2">
                    <Skeleton circle w={40} delay={delay} />
                    <div className="flex flex-col gap-0.5">
                        <div className="flex h-[21px] items-center gap-1.5">
                            <Skeleton w={112} delay={delay} />
                            <Skeleton w={56} h={10} delay={delay} />
                        </div>
                        <div className="flex h-[18px] items-center gap-1.5">
                            <Skeleton w={48} h={10} delay={delay} />
                            <Skeleton circle w={12} delay={delay} />
                        </div>
                    </div>
                </div>
                <Skeleton w={20} h={4} className="me-1.5" delay={delay} />
            </div>

            <div className="flex min-w-0 flex-col gap-1 px-3 md:px-6">
                {variant.lines.map((width, line) => (
                    // biome-ignore lint/suspicious/noArrayIndexKey: a fixed, never-reordered list.
                    <div key={line} className="flex h-[21px] items-center">
                        <Skeleton w={width} delay={delay} />
                    </div>
                ))}
                {variant.media ? (
                    <Skeleton
                        h="auto"
                        className={cn('mt-1 w-full rounded-[8px]', variant.media)}
                        delay={delay}
                    />
                ) : null}
            </div>

            <div className="flex h-9 items-center justify-between px-3 md:h-10 md:px-4">
                <div className="flex items-center gap-2">
                    {[0, 1].map(action => (
                        <span key={action} className="flex items-center gap-1">
                            <span className="flex size-8 items-center justify-center">
                                <Skeleton circle w={22} delay={delay} />
                            </span>
                            <Skeleton w={16} h={10} delay={delay} />
                        </span>
                    ))}
                </div>
                <div className="flex items-center gap-0.5">
                    {[0, 1, 2].map(action => (
                        <span key={action} className="flex size-8 items-center justify-center">
                            <Skeleton circle w={22} delay={delay} />
                        </span>
                    ))}
                </div>
            </div>
        </div>
    )
}
