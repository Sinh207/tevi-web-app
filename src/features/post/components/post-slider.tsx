'use client'

import { useRequireStars } from '@features/balance'
import { AnimatedAvatar } from '@shared/components/animated-avatar'
import { PremiumBadge } from '@shared/components/premium-badge'
import { StarMark } from '@shared/components/star-mark'
import { VerifiedBadge } from '@shared/components/verified-badge'
import { useTranslation } from '@shared/i18n/use-translation'
import { formatCompactCount } from '@shared/lib/format-count'
import { useWebConfig } from '@shared/lib/remote-config'
import { subTestId } from '@shared/lib/test-id'
import { cn } from '@shared/lib/utils'
import { Icon } from '@shared/ui/icon'
import type { TeviIconName, TeviIconNameFilled } from '@shared/ui/icon-names'
import Image from 'next/image'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Post } from '../api/types'
import { usePostBookmark } from '../hooks/use-post-bookmark'
import { usePostReaction } from '../hooks/use-post-reaction'
import { hasReacted, isGated, postActionVisibility, replyCost } from '../lib/post-access'
import { formatPostTimestamp, truncateSliderCaption } from '../lib/post-format'
import { isLocalImageSrc, videoSrc } from '../lib/post-media'

/**
 * The **post slider** — legacy's `ViewMediaSlide` + `PostSlider`, full screen, one post per screen.
 *
 * ## It is a scroller, not a carousel, and that is legacy's own shape
 *
 * `direction='vertical'`, `slidesPerView={1}`, `mousewheel` with `forceToAxis` — a reader moves
 * between posts by **scrolling**, on a wheel or a thumb. So this is a vertical scroll-snap column
 * and not a transform track: `docs/DESIGN_SYSTEM.md` §10 draws that line, and it is the same
 * reasoning the post gallery follows horizontally. Native scrolling keeps momentum, keeps
 * `overscroll-behavior`, and keeps the browser scrolling a focused control into view — three things
 * a transform track gives up.
 *
 * Arrow keys and the two chevrons do the same thing for a reader who is not scrolling.
 *
 * ## The layout is legacy's, and the first attempt at it was wrong
 *
 * Media centred; the **identity and the caption at the bottom** over a gradient; the **actions in a
 * vertical rail** on the trailing edge. The first pass put the identity in a bar at the top and the
 * actions in the feed's horizontal row, which is the card's arrangement wearing a black background
 * — it reads as a card on a dark page rather than as a viewer.
 *
 * Legacy moves the rail: beside the media from `md` up, an absolute overlay at the bottom-trailing
 * corner below it. Kept, because on a phone the media is the full width and a rail beside it would
 * have nothing to sit in.
 *
 * ## Only three slides carry media
 *
 * Every loaded post is a snap target — that is what makes the scrollbar honest and the gesture
 * continuous — but a post more than one away from the reader renders an empty box of the same
 * height. Forty full-screen `<video>` and `next/image` nodes is the thing `useRenderWindow` exists
 * to avoid on the feed, and it is worse here because every one of them is viewport-sized.
 */
export function PostSlider({
    posts,
    index,
    onIndexChange,
    onClose,
    onLoadMore,
    hasMore = false,
    isPremiumReader = false,
    onShare,
    onComment,
    testId = 'post-slider',
}: {
    posts: Post[]
    /** Which post is on screen. The scroller reports its own changes through `onIndexChange`. */
    index: number
    onIndexChange: (index: number) => void
    onClose: () => void
    onLoadMore?: () => void
    hasMore?: boolean
    isPremiumReader?: boolean
    onShare?: (post: Post) => void
    /** Go to the post's page. The viewer closes itself first — see the rail. */
    onComment?: (post: Post) => void
    testId?: string
}) {
    const { t } = useTranslation()
    const scrollerRef = useRef<HTMLDivElement>(null)
    const [mounted, setMounted] = useState(false)

    // `document` does not exist on the server, so the portal target is resolved after mount.
    useEffect(() => setMounted(true), [])

    /**
     * Scroll the reader to the post the caller asked for, without animating on the first paint.
     *
     * A ref rather than state for the last index applied: this effect must not run for a change it
     * caused itself, which is exactly what happens when the observer below reports a new index.
     */
    const appliedIndex = useRef(-1)
    useEffect(() => {
        const el = scrollerRef.current
        if (!el || !mounted) return
        if (appliedIndex.current === index) return
        const first = appliedIndex.current === -1
        appliedIndex.current = index
        el.scrollTo({ top: index * el.clientHeight, behavior: first ? 'auto' : 'smooth' })
    }, [index, mounted])

    /**
     * Which post the reader has actually landed on.
     *
     * Read off `scrollTop` rather than from an `IntersectionObserver`: the slides are exactly one
     * viewport tall and snapped, so the arithmetic is exact and cheap, where an observer would fire
     * in bursts through the whole gesture and need the same rounding anyway.
     */
    function onScroll() {
        const el = scrollerRef.current
        if (!el || el.clientHeight === 0) return
        const at = Math.round(el.scrollTop / el.clientHeight)
        if (at === appliedIndex.current) return
        appliedIndex.current = at
        onIndexChange(at)
        // Ask early rather than at the last slide; a full-screen reader has nothing else to look at.
        if (hasMore && at >= posts.length - 3) onLoadMore?.()
    }

    useEffect(() => {
        function onKey(event: KeyboardEvent) {
            if (event.key === 'Escape') onClose()
            if (event.key === 'ArrowDown') onIndexChange(Math.min(index + 1, posts.length - 1))
            if (event.key === 'ArrowUp') onIndexChange(Math.max(index - 1, 0))
        }
        document.addEventListener('keydown', onKey)
        return () => document.removeEventListener('keydown', onKey)
    }, [onClose, onIndexChange, index, posts.length])

    if (!mounted) return null

    return createPortal(
        <div
            role="dialog"
            aria-modal="true"
            aria-label={t('post_lightbox_title')}
            data-testid={testId}
            className="fixed inset-0 z-50 bg-black"
        >
            <button
                type="button"
                onClick={onClose}
                aria-label={t('common_close')}
                data-testid={subTestId(testId, 'close')}
                className="absolute end-4 top-4 z-20 flex size-10 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"
            >
                <Icon name="xmark" size={24} />
            </button>

            {posts.length > 1 ? (
                <span
                    data-testid={subTestId(testId, 'label-data')}
                    className="type-caption-meta absolute start-4 top-4 z-20 rounded-full bg-black/50 px-3 py-1 text-white"
                >
                    {`${index + 1} / ${posts.length}`}
                </span>
            ) : null}

            <div
                ref={scrollerRef}
                onScroll={onScroll}
                data-testid={subTestId(testId, 'list')}
                /*
                 * `overscroll-contain` so a flick at either end does not pull the page behind the
                 * viewer, and the scrollbar is hidden because a full-screen pager showing one is
                 * a scrollbar next to nothing to scroll past.
                 */
                className="h-full snap-y snap-mandatory overflow-y-auto overscroll-contain [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            >
                {posts.map((post, at) => (
                    <section
                        key={post.id}
                        /*
                         * `data-card-id`, not `data-window-key`: this is not a windowed row —
                         * nothing measures or stands these down — it is a snap target carrying a
                         * post's identity, which is the companion attribute for exactly that.
                         */
                        data-card-id={post.id}
                        className="relative h-full w-full snap-start snap-always"
                    >
                        {Math.abs(at - index) <= 1 ? (
                            <PostSliderSlide
                                post={post}
                                isPremiumReader={isPremiumReader}
                                onNextPost={
                                    at < posts.length - 1 ? () => onIndexChange(at + 1) : undefined
                                }
                                onShare={onShare ? () => onShare(post) : undefined}
                                onComment={onComment ? () => onComment(post) : undefined}
                                testId={testId}
                            />
                        ) : null}
                    </section>
                ))}
            </div>

            {index > 0 ? (
                <SliderChevron
                    side="up"
                    label={t('post_slider_previous_post')}
                    onPress={() => onIndexChange(index - 1)}
                    testId={subTestId(subTestId(testId, 'list'), 'prev')}
                />
            ) : null}
        </div>,
        document.body,
    )
}

/** One post: its media, its identity and caption at the foot, its actions on the trailing edge. */
function PostSliderSlide({
    post,
    isPremiumReader,
    onShare,
    onComment,
    onNextPost,
    testId,
}: {
    post: Post
    isPremiumReader: boolean
    onShare?: () => void
    onComment?: () => void
    /** Drawn on the info block's top edge — see there for why it cannot live on the container. */
    onNextPost?: () => void
    testId: string
}) {
    const { t } = useTranslation()
    const images = post.images ?? []
    const clip = videoSrc(post.video)
    const [picture, setPicture] = useState(0)
    const current = images[Math.min(picture, images.length - 1)]
    const src = current?.uri ?? current?.thumb ?? null

    return (
        <>
            {/*
             * `md:pe-20` leaves the rail its column from `md` up, where legacy puts it beside the
             * media rather than over it. Below that the media is the full width and the rail floats.
             */}
            <div className="flex h-full w-full items-center justify-center md:pe-20">
                {clip ? (
                    /* biome-ignore lint/a11y/useMediaCaption: a post's clip carries no track. */
                    <video
                        src={clip}
                        controls
                        playsInline
                        preload="metadata"
                        data-testid={subTestId(testId, 'slide')}
                        className="max-h-full max-w-full"
                    />
                ) : src ? (
                    <Image
                        key={picture}
                        src={src}
                        alt={t('post_image_alt')}
                        width={current?.width ?? current?.w ?? 1600}
                        height={current?.height ?? current?.h ?? 1600}
                        sizes="100vw"
                        unoptimized={isLocalImageSrc(src)}
                        data-testid={subTestId(testId, 'slide')}
                        className="max-h-full w-auto max-w-full object-contain"
                    />
                ) : null}
            </div>

            {/* The pictures of **this** post, on the horizontal axis — posts are the vertical one. */}
            {images.length > 1 && !clip ? (
                <>
                    <SliderChevron
                        side="start"
                        label={t('common_previous')}
                        onPress={() => setPicture(p => (p - 1 + images.length) % images.length)}
                        testId={subTestId(testId, 'prev')}
                    />
                    <SliderChevron
                        side="end"
                        label={t('common_next')}
                        onPress={() => setPicture(p => (p + 1) % images.length)}
                        testId={subTestId(testId, 'next')}
                    />
                </>
            ) : null}

            <PostSliderInfo
                post={post}
                onNextPost={onNextPost}
                pictureLabel={
                    images.length > 1 && !clip
                        ? `${Math.min(picture, images.length - 1) + 1} / ${images.length}`
                        : undefined
                }
                testId={testId}
            />

            <PostSliderRail
                post={post}
                isPremiumReader={isPremiumReader}
                onShare={onShare}
                onComment={onComment}
                testId={testId}
            />
        </>
    )
}

/**
 * The identity and the caption, at the foot of the media over legacy's gradient.
 *
 * `rgba(8,9,13,0)` → `rgba(8,9,13,0.9)` at 80%, with a 1px backdrop blur — legacy's own values, and
 * they are what make white text legible over an arbitrary photograph without a solid bar covering
 * the bottom of it.
 */
function PostSliderInfo({
    post,
    pictureLabel,
    onNextPost,
    testId,
}: {
    post: Post
    pictureLabel?: string
    /**
     * ⚠ The next-post chevron is drawn **here**, on this block's top edge, and not on the viewer's.
     *
     * Anchored to the viewport it sat at a fixed offset from the bottom and a two-line caption grew
     * straight through it — seen in a screenshot. This block's height is whatever the caption makes
     * it, so hanging the control off its top edge is the only placement that cannot collide.
     */
    onNextPost?: () => void
    testId: string
}) {
    const { t, currentLanguage } = useTranslation()
    const [expanded, setExpanded] = useState(false)

    const channel = post.channel
    const name = channel?.name ?? ''
    const text = post.text ?? ''
    const shown = expanded ? text : truncateSliderCaption(text)
    const truncated = shown !== text

    return (
        <div
            data-testid={subTestId(testId, 'footer')}
            /* `relative`, so the next-post chevron below hangs off **this** block rather than the slide. */
            className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex flex-col gap-2 p-3 pt-16 backdrop-blur-[1px] md:gap-4 md:p-4 md:pt-20 md:pe-24"
            style={{
                background:
                    'linear-gradient(180deg, rgba(8, 9, 13, 0) 0%, rgba(8, 9, 13, 0.9) 80.37%)',
            }}
        >
            {onNextPost ? (
                <button
                    type="button"
                    onClick={onNextPost}
                    aria-label={t('post_slider_next_post')}
                    data-testid={subTestId(subTestId(testId, 'list'), 'next')}
                    className="pointer-events-auto absolute -top-5 start-1/2 z-10 flex size-10 -translate-x-1/2 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 rtl:translate-x-1/2"
                >
                    <Icon name="angle-up" size={24} className="rotate-180" />
                </button>
            ) : null}

            <div className="pointer-events-auto flex items-center gap-2">
                <AnimatedAvatar
                    size="medium"
                    thumb={channel?.images?.thumb ?? null}
                    avatarVideo={channel?.images?.avatar_video ?? null}
                    isPremium={channel?.is_premium ?? false}
                    alt=""
                    initials={name.trim() ? name.trim().slice(0, 2).toUpperCase() : undefined}
                    className="flex-none"
                />
                <span className="flex min-w-0 flex-col">
                    <span className="flex min-w-0 items-center gap-0.5">
                        <span className="type-dense-emphasis max-w-[130px] truncate text-white md:max-w-[200px]">
                            {name}
                        </span>
                        <VerifiedBadge
                            image={channel?.verified_tick_badge?.image ?? null}
                            size={16}
                        />
                        {channel?.is_premium ? (
                            <PremiumBadge size={18} className="flex-none" />
                        ) : null}
                        {channel?.slug ? (
                            <span className="type-caption-meta max-w-[100px] truncate text-white/80 md:max-w-[200px]">
                                {`@${channel.slug}`}
                            </span>
                        ) : null}
                    </span>
                    <span className="flex items-center gap-1 text-white/60">
                        {post.created_at ? (
                            <time dateTime={post.created_at} className="type-caption-meta">
                                {formatPostTimestamp(post.created_at, currentLanguage)}
                            </time>
                        ) : null}
                        <span
                            aria-hidden="true"
                            className="size-0.5 flex-none rounded-full bg-current"
                        />
                        <Icon
                            name={isGated(post) ? 'badge-dollar' : 'user-simple-alt'}
                            size={16}
                            title={t(
                                isGated(post) ? 'post_audience_paid' : 'post_audience_everyone',
                            )}
                        />
                        {pictureLabel ? (
                            <span className="type-caption-meta">{pictureLabel}</span>
                        ) : null}
                    </span>
                </span>
            </div>

            {text ? (
                /*
                 * A **button**, not a paragraph with a handler: it toggles state, so it is a
                 * control and has to be reachable without a pointer. `text-start` because a button
                 * centres its text and a caption is prose.
                 */
                <button
                    type="button"
                    disabled={!truncated && !expanded}
                    onClick={() => setExpanded(current => !current)}
                    data-testid={subTestId(testId, 'description')}
                    className="pointer-events-auto max-w-full text-start md:max-w-[316px]"
                >
                    <span
                        className={cn(
                            'type-dense-default break-words text-white',
                            expanded ? 'whitespace-pre-line' : 'whitespace-normal',
                        )}
                        style={{ textShadow: '0px 1px 2px rgba(0, 0, 0, 0.25)' }}
                    >
                        {shown}
                        {truncated ? (
                            <>
                                {'... '}
                                {/* Legacy's `#B9A4E6` — a lilac that survives any photograph under it. */}
                                <span className="type-dense-emphasis text-[#B9A4E6]">
                                    {t('post_slider_more')}
                                </span>
                            </>
                        ) : null}
                    </span>
                </button>
            ) : null}
        </div>
    )
}

/**
 * The action rail — legacy's seven `btnSlider` variants, as the four this app has behaviour for.
 *
 * Vertical, on the trailing edge, and the counts sit **under** each glyph rather than beside it:
 * that is what a rail is, and it is why this is not `PostActions` with different classes. The two
 * stateful ones reuse the card's own hooks, so a reaction made here is the same optimistic write it
 * would be on the feed and lands in the same cache.
 */
function PostSliderRail({
    post,
    isPremiumReader,
    onShare,
    onComment,
    testId,
}: {
    post: Post
    isPremiumReader: boolean
    onShare?: () => void
    onComment?: () => void
    testId: string
}) {
    const { t, currentLanguage } = useTranslation()
    const reaction = usePostReaction(post)
    const bookmark = usePostBookmark(post)
    const requireStars = useRequireStars()
    /**
     * What a comment costs on this post, and the reader's Premium exemption applied.
     *
     * The same `replyCost` the card's row reads, and it is why `isPremiumReader` is threaded this
     * far: a paid-interaction post must say what pressing *Comment* will charge, and a Premium
     * reader must not be told a price they do not owe. Without it the prop was unused — Biome said
     * so, and the honest repair was to use it rather than to delete it.
     */
    const cost = replyCost(post, { isPremiumReader })
    /*
     * `quoteEnabled` is the console's flag, and the rail asks the same question the card's row
     * does — `PostActions` reads it from the same place. Quote itself is not drawn here yet, so
     * only `comment` and `bookmark` are consulted; the argument is still required and still honest.
     */
    const visibility = postActionVisibility(post, {
        quoteEnabled: useWebConfig().post.createPost.quote.isActive,
    })

    return (
        <div
            data-testid={subTestId(testId, 'group')}
            className="absolute end-2 bottom-24 z-20 flex flex-col items-center gap-3 md:end-4 md:bottom-4"
        >
            <RailButton
                icon={hasReacted(post) ? 'star' : 'star'}
                filled={hasReacted(post)}
                label={t('post_action_react')}
                count={formatCompactCount(reaction.count, currentLanguage)}
                active={reaction.reacted}
                onPress={reaction.toggle}
                testId={subTestId(testId, 'apply')}
            />
            {visibility.comment ? (
                <RailButton
                    icon="comment"
                    label={t('post_action_comment')}
                    /*
                     * The **price** where there is one, the tally where there is not. A rail has
                     * room for one number under a glyph, and "this will cost you 5" is the one a
                     * reader has to see before they press, not after.
                     */
                    count={
                        cost !== null
                            ? formatCompactCount(cost, currentLanguage)
                            : formatCompactCount(post.reply_count, currentLanguage)
                    }
                    costly={cost !== null}
                    onPress={cost !== null && onComment ? requireStars(cost, onComment) : onComment}
                    testId={subTestId(testId, 'confirm')}
                />
            ) : null}
            {visibility.bookmark ? (
                <RailButton
                    icon="bookmark-simple"
                    filled={bookmark.bookmarked}
                    label={t('post_action_bookmark')}
                    active={bookmark.bookmarked}
                    onPress={bookmark.toggle}
                    testId={subTestId(testId, 'reveal')}
                />
            ) : null}
            <RailButton
                icon="share"
                label={t('post_action_share')}
                onPress={onShare}
                testId={subTestId(testId, 'copy')}
            />
        </div>
    )
}

function RailButton({
    icon,
    filled,
    label,
    count,
    costly,
    active,
    onPress,
    testId,
}: {
    icon: TeviIconName
    filled?: boolean
    label: string
    count?: string
    /** The number under the glyph is a **price**, so it carries the Star mark rather than reading as a tally. */
    costly?: boolean
    active?: boolean
    onPress?: () => void
    testId?: string
}) {
    if (!onPress) return null
    return (
        <button
            type="button"
            onClick={onPress}
            aria-label={label}
            aria-pressed={active}
            data-testid={testId}
            className="flex flex-col items-center gap-0.5 text-white"
        >
            <span className="flex size-10 items-center justify-center rounded-full bg-black/40 backdrop-blur-[2px]">
                {/*
                 * Two elements rather than a `weight` that may be `undefined`: the sprite types
                 * weights **per glyph**, so `weight="filled"` narrows `name` to the filled union
                 * and a conditional weight cannot satisfy both branches at once. `PostActions`
                 * splits it the same way.
                 */}
                {filled ? (
                    <Icon
                        name={icon as TeviIconNameFilled}
                        weight="filled"
                        size={24}
                        className={active ? 'text-(--text-brand)' : undefined}
                    />
                ) : (
                    <Icon
                        name={icon}
                        size={24}
                        className={active ? 'text-(--text-brand)' : undefined}
                    />
                )}
            </span>
            {count ? (
                <span className="type-caption-meta flex items-center gap-0.5">
                    {costly ? <StarMark size={12} /> : null}
                    {count}
                </span>
            ) : null}
        </button>
    )
}

/** One chevron. `up`/`down` page posts, `start`/`end` page one post's pictures. */
function SliderChevron({
    side,
    label,
    onPress,
    testId,
}: {
    side: 'start' | 'end' | 'up' | 'down'
    label: string
    onPress: () => void
    testId?: string
}) {
    const vertical = side === 'up' || side === 'down'
    return (
        <button
            type="button"
            onClick={onPress}
            aria-label={label}
            data-testid={testId}
            className={cn(
                'absolute z-20 flex size-10 items-center justify-center rounded-full',
                'bg-white/10 text-white hover:bg-white/20',
                vertical
                    ? [
                          'start-1/2 -translate-x-1/2 rtl:translate-x-1/2',
                          side === 'up' ? 'top-16' : 'bottom-4',
                      ]
                    : ['top-1/2 -translate-y-1/2', side === 'start' ? 'start-4' : 'end-4'],
            )}
        >
            <Icon
                name={vertical ? 'angle-up' : 'angle-left'}
                size={24}
                className={cn(
                    (side === 'down' || side === 'end') && 'rotate-180',
                    !vertical && 'rtl:rotate-180',
                )}
            />
        </button>
    )
}
