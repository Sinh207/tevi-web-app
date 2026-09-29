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
import { LockMediaIcon } from './legacy-icons'

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
            className="fixed inset-0 z-50 flex bg-black"
        >
            {/*
             * Below `md` the close is a disc over the media, which is legacy's mobile branch. From
             * `md` it moves into the control column beside it and takes that column's own styling —
             * 48px on `#1e1e1e` with a grey glyph that whitens on hover, not a translucent disc.
             */}
            <button
                type="button"
                onClick={onClose}
                aria-label={t('common_close')}
                data-testid={subTestId(testId, 'close')}
                className="absolute end-3 top-3 z-30 flex size-10 items-center justify-center rounded-full bg-black/50 text-white hover:bg-black/70 md:hidden"
            >
                <Icon name="xmark" size={24} />
            </button>

            <div
                ref={scrollerRef}
                onScroll={onScroll}
                data-testid={subTestId(testId, 'list')}
                /*
                 * `overscroll-contain` so a flick at either end does not pull the page behind the
                 * viewer, and the scrollbar is hidden because a full-screen pager showing one is
                 * a scrollbar next to nothing to scroll past.
                 */
                className="h-full min-w-0 flex-1 snap-y snap-mandatory overflow-y-auto overscroll-contain [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
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
                                onShare={onShare ? () => onShare(post) : undefined}
                                onComment={onComment ? () => onComment(post) : undefined}
                                testId={testId}
                            />
                        ) : null}
                    </section>
                ))}
            </div>

            {/*
             * ⚠ **Legacy's control column, and it is desktop-only.** `viewMediaSlide` renders the
             * whole block inside its `matchUpMd` branch: on a phone the only way between posts is
             * the scroll, which is the gesture the viewer is built around. Two 40px arrows in a
             * fixed column would take a thumb's width of the media away from it for nothing.
             *
             * The pill is legacy's own — `rgba(255,255,255,0.1)`, radius 32, padding `8px 4px` —
             * and the two arrows **stay put and dim** at the ends rather than disappearing, which
             * is the opposite of the picture arrows inside a post. That asymmetry is legacy's and
             * it reads: the column is furniture, so it keeps its shape; an arrow over a photograph
             * is not, so it goes when it has nowhere to point.
             */}
            <div className="hidden shrink-0 flex-col items-center p-3 md:flex">
                <button
                    type="button"
                    onClick={onClose}
                    aria-label={t('common_close')}
                    data-testid={subTestId(testId, 'clear')}
                    className="flex size-12 items-center justify-center rounded-[40px] bg-[#1e1e1e] text-[#A3A3A3] transition-colors hover:bg-black/70 hover:text-white"
                >
                    <Icon name="xmark" size={24} />
                </button>

                {posts.length > 1 ? (
                    <div className="flex flex-1 items-center">
                        <div className="flex flex-col rounded-[32px] bg-white/10 px-1 py-2">
                            <PostNavButton
                                direction="up"
                                label={t('post_slider_previous_post')}
                                disabled={index === 0}
                                onPress={() => onIndexChange(index - 1)}
                                testId={subTestId(subTestId(testId, 'list'), 'prev')}
                            />
                            <PostNavButton
                                direction="down"
                                label={t('post_slider_next_post')}
                                disabled={index >= posts.length - 1}
                                onPress={() => onIndexChange(index + 1)}
                                testId={subTestId(subTestId(testId, 'list'), 'next')}
                            />
                        </div>
                    </div>
                ) : null}
            </div>
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
    testId,
}: {
    post: Post
    isPremiumReader: boolean
    onShare?: () => void
    onComment?: () => void
    testId: string
}) {
    const { t } = useTranslation()
    const images = post.images ?? []
    const clip = videoSrc(post.video)
    const [picture, setPicture] = useState(0)
    const current = images[Math.min(picture, images.length - 1)]
    const src = current?.uri ?? current?.thumb ?? null
    /* `null` when the backend sent no dimensions — then the clip keeps its intrinsic box. */
    const clipRatio =
        post.video?.width && post.video?.height ? post.video.width / post.video.height : null

    return (
        /*
         * ⚠ **A row, and the media area is a real `flex-1` column** — legacy's `post-slider-stack`.
         *
         * It was one full-width box with `md:pe-20` reserving space for the rail, which is not the
         * same arrangement and looks wrong: the padding pushes the media's *centre* left by half of
         * it, and the rail still floats over the media rather than beside it, so the reserved strip
         * and the occupied strip are two different strips. With a real column the media centres in
         * what is actually left, which is what legacy does and what the video made obvious.
         *
         * Everything that belongs **over the media** — the arrows, the counter, the foot gradient —
         * goes inside the media area rather than on this root, so none of it runs under the rail.
         */
        <div className="relative flex h-full w-full">
            {/*
             * ⚠ **A clip stacks; a picture overlays.** The foot is `absolute` over a picture, which
             * is what legacy does for everything — but legacy's video has **no native controls**:
             * it draws its own progress bar inside the gradient, so nothing of the player's is
             * under it. This one hands the browser `controls`, and that bar lands in the bottom
             * ~40px of the video — exactly where a 0.9-opacity gradient and a `backdrop-blur` are
             * painted, so the reader gets a dimmed, half-legible player.
             *
             * Raising the video over the foot is not the repair: the video is opaque and fills the
             * area, so it would hide the caption instead. Until the custom bar is ported, a clip
             * puts the foot **in flow** under the media — the player keeps its own bar intact and
             * the caption keeps its own band, and neither is over the other.
             */}
            <div
                className={cn(
                    'relative flex h-full min-w-0 flex-1 overflow-hidden',
                    clip ? 'flex-col' : 'items-center justify-center',
                )}
            >
                {clip ? (
                    <div className="flex min-h-0 flex-1 items-center justify-center">
                        {/*
                         * ⚠ **Sized by its own aspect ratio, not by `max-w`/`max-h`.**
                         *
                         * A `max-*` pair only ever shrinks, so a 300px clip stayed 300px in a 1300px
                         * area — small, and with the controls bar the thing the eye reads as
                         * off-centre. Legacy sizes the media box instead (`nsfwSizeProps`): the
                         * aspect ratio, then `height: 100%` for a portrait and `width: 100%` for a
                         * landscape, so it grows to the axis that binds and is letterboxed on the
                         * other. `max-w/max-h-full` stay as the ceiling the ratio is clamped against.
                         */}
                        {/* biome-ignore lint/a11y/useMediaCaption: a post's clip carries no track. */}
                        <video
                            src={clip}
                            controls
                            playsInline
                            preload="metadata"
                            data-testid={subTestId(testId, 'slide')}
                            className={cn(
                                'max-h-full max-w-full',
                                clipRatio === null
                                    ? ''
                                    : clipRatio < 1
                                      ? 'h-full w-auto'
                                      : 'h-auto w-full',
                            )}
                            style={clipRatio === null ? undefined : { aspectRatio: clipRatio }}
                        />
                    </div>
                ) : src ? (
                    /*
                     * `object-contain` over the **whole** area, which is legacy's gallery branch —
                     * it grows a small picture to the area and letterboxes it, where a `max-*`
                     * pair would leave it at its intrinsic size in the middle of a black screen.
                     */
                    <Image
                        key={picture}
                        src={src}
                        alt={t('post_image_alt')}
                        width={current?.width ?? current?.w ?? 1600}
                        height={current?.height ?? current?.h ?? 1600}
                        sizes="100vw"
                        unoptimized={isLocalImageSrc(src)}
                        data-testid={subTestId(testId, 'slide')}
                        className="h-full w-full object-contain"
                    />
                ) : null}

                {/* The pictures of **this** post, on the horizontal axis — posts are the vertical one. */}
                {/*
                 * ⚠ **They disappear at the ends; they do not wrap.** Legacy's own rule — its disabled
                 * state is `display: none`, not a dimmed button — and it is the opposite of the post
                 * column's, which dims and stays. An arrow over a photograph is not furniture, so it
                 * goes when it has nowhere to point; `%` wrap-around was this file's invention and it
                 * makes the last picture look like the first.
                 *
                 * They are drawn **below `md` too**, which legacy is not — its wrapper is inside
                 * `matchUpMd`, and it can afford that because its gallery is a Swiper the reader
                 * flicks. This one is a picture and an index, so hiding the arrows on a phone would
                 * leave ten of the eleven unreachable. The inset is legacy's own `xs` value, which it
                 * wrote and then never rendered.
                 */}
                {images.length > 1 && !clip ? (
                    <>
                        {picture > 0 ? (
                            <PictureNavButton
                                side="start"
                                label={t('common_previous')}
                                onPress={() => setPicture(p => p - 1)}
                                testId={subTestId(testId, 'prev')}
                            />
                        ) : null}
                        {picture < images.length - 1 ? (
                            <PictureNavButton
                                side="end"
                                label={t('common_next')}
                                onPress={() => setPicture(p => p + 1)}
                                testId={subTestId(testId, 'next')}
                            />
                        ) : null}
                    </>
                ) : null}

                {/*
                 * The counter, at the **top leading corner of the media** — legacy's pill:
                 * `rgba(0,0,0,0.5)`, radius 40, a 16px stacked-frames mark and `n of total`. It was an
                 * inline `1 / 11` in the identity row, which is a different statement: that line is
                 * about the post, and this is about where you are inside its pictures.
                 */}
                {images.length > 1 && !clip ? (
                    <span
                        data-testid={subTestId(testId, 'label-data')}
                        className="type-caption-meta absolute start-2 top-2 z-10 flex items-center gap-1 rounded-[40px] bg-black/50 px-2 py-1 text-white md:start-3 md:top-3"
                    >
                        <LockMediaIcon kind="images" size={16} />
                        {t('post_slider_picture_count', {
                            index: picture + 1,
                            total: images.length,
                        })}
                    </span>
                ) : null}

                <PostSliderInfo post={post} inFlow={Boolean(clip)} testId={testId} />
            </div>

            <PostSliderRail
                post={post}
                isPremiumReader={isPremiumReader}
                onShare={onShare}
                onComment={onComment}
                testId={testId}
            />
        </div>
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
    inFlow,
    testId,
}: {
    post: Post
    /** Sits **under** the media rather than over it — see the media area's note. Clips only. */
    inFlow: boolean
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
            /*
             * Legacy's own padding and gap — `10px`/`8px` below `md`, `16px`/`16px` above — and it
             * is symmetric. The trailing strip it used to reserve was for a rail that now has its
             * own column; below `md` the rail still floats, but its `py-10` lifts it clear.
             */
            className={cn(
                'pointer-events-none z-10 flex flex-col gap-2 p-2.5 backdrop-blur-[1px] md:gap-4 md:p-4',
                /*
                 * The tall top padding is the gradient's own fade — it needs the height to fade
                 * *through*. In flow that height would be dead space above the caption, so it
                 * goes, and the block is only as tall as what is in it.
                 */
                inFlow ? 'flex-none' : 'absolute inset-x-0 bottom-0 pt-16 md:pt-20',
            )}
            style={{
                background:
                    'linear-gradient(180deg, rgba(8, 9, 13, 0) 0%, rgba(8, 9, 13, 0.9) 80.37%)',
            }}
        >
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
            /*
             * One node, two arrangements, which is what keeps it one set of testids: below `md` it
             * floats at the trailing edge over the media (legacy's `post-slider-actions-mobile`,
             * `marginRight` 6/10 and `padding: 40px 0` — the padding is what lifts it off the
             * caption), and from `md` it is `static`, so it joins the row as its own 64px column
             * and stops covering the picture (`post-slider-actions-desktop`, `p-3`, bottom-aligned).
             */
            className="absolute end-0 bottom-0 z-20 me-1.5 flex flex-col items-center justify-center gap-2 py-10 sm:me-2.5 sm:gap-3 sm:py-[60px] md:static md:me-0 md:h-full md:justify-end md:p-3 md:py-3"
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

/**
 * One picture arrow — 40px, `rgba(0,0,0,0.5)`, inset 12 on a phone and 50 from `md`.
 *
 * Legacy's numbers. The inset is large on a desktop because the media is letterboxed there and the
 * arrow sits *over the black*, not over the photograph.
 */
function PictureNavButton({
    side,
    label,
    onPress,
    testId,
}: {
    side: 'start' | 'end'
    label: string
    onPress: () => void
    testId?: string
}) {
    return (
        <button
            type="button"
            onClick={onPress}
            aria-label={label}
            data-testid={testId}
            className={cn(
                'absolute top-1/2 z-10 flex size-10 -translate-y-1/2 items-center justify-center',
                'rounded-full bg-black/50 text-white transition-colors hover:bg-black/70',
                side === 'start' ? 'start-3 md:start-[50px]' : 'end-3 md:end-[50px]',
            )}
        >
            <Icon
                name="angle-left"
                size={24}
                className={cn(side === 'end' && 'rotate-180', 'rtl:rotate-180')}
            />
        </button>
    )
}

/** One arrow in the post column's pill — it stays and dims at the ends. See the column's note. */
function PostNavButton({
    direction,
    label,
    disabled,
    onPress,
    testId,
}: {
    direction: 'up' | 'down'
    label: string
    disabled: boolean
    onPress: () => void
    testId?: string
}) {
    return (
        <button
            type="button"
            onClick={onPress}
            disabled={disabled}
            aria-label={label}
            data-testid={testId}
            className="flex size-10 items-center justify-center rounded-full text-white transition-colors hover:bg-black/70 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent"
        >
            <Icon name="angle-up" size={24} className={cn(direction === 'down' && 'rotate-180')} />
        </button>
    )
}
