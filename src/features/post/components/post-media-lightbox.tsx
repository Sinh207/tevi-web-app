'use client'

import { useTranslation } from '@shared/i18n/use-translation'
import { subTestId } from '@shared/lib/test-id'
import { cn } from '@shared/lib/utils'
import { Icon } from '@shared/ui/icon'
import Image from 'next/image'
import { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Post, PostImage, PostVideo } from '../api/types'
import { videoFallbackSrc, videoSrc } from '../lib/post-media'
import { PostActions } from './post-actions'
import { PostHeader } from './post-header'

/**
 * Media at full size — legacy's `ViewMediaSlide`, at the scope a card actually needs.
 *
 * ## What it is, and the one thing it deliberately is not
 *
 * A fullscreen overlay over one post's media: every image, arrow- and keyboard-navigable, plus the
 * video.
 *
 * ## It pages between **posts** too now, and the list is the caller's
 *
 * Legacy's `ViewMediaSlide` fetches the next posts itself (`handleGetNextPosts`,
 * `handleGetPostsHome`, a `typePost` discriminator and its own pagination) — four feeds' worth of
 * paging inside a media viewer. This header used to say that half was missing because there was no
 * feed to page through; there are four now, and it is still not done that way.
 *
 * Instead the viewer **asks** and the list **answers**: `onPrevPost` / `onNextPost` are supplied by
 * whoever owns the list, which already knows how to page and has already done so. The viewer stays
 * ignorant of feeds, the feed stays ignorant of the viewer's geometry, and a fifth list needs no
 * change here. It is the same division `onShare` and `onChanged` already use on the card.
 *
 * `post` is what turns it from a media viewer into legacy's **slider**: with one, the author and
 * the action row are drawn over the media, so a reader can react, comment or share without leaving.
 * Without one — a reply's pictures — it is the plain viewer it has always been.
 *
 * ⚠ It takes **no `onChanged`**, and that is not an omission. The header here is drawn without
 * `actions`, so there is no menu and none of the four writes that would need a list to refetch; the
 * action row's own writes (react, bookmark) keep their own optimistic state and invalidate their
 * own queries. A prop was declared for it at first and nothing could ever have called it — Biome
 * is what noticed.
 *
 * ⚠ **The video plays HLS, and one browser family can do that unaided.**
 *
 * `video.playback.hls` is an `.m3u8` manifest and is what the native clients play. Safari (and the
 * iOS WebViews) play it unaided; Chrome and Firefox do **not** without a media-source engine —
 * legacy dynamic-imports **video.js** for exactly this. Adding one is a dependency decision of the
 * same weight as `embla` or `react-day-picker` — the sort `CLAUDE.md` records as "the app's only X
 * engine" — so it is not taken here.
 *
 * Two things stand in for it, in order. First the **mp4**, when the payload carries one: that is
 * iOS's own `backupAsset`, and `LightboxVideo` picks it from `canPlayType` before the first frame
 * instead of after a failed `AVPlayerItem`. Only when there is no mp4 either — the common case, as
 * a transcoded post exposes the manifest alone — is the reader **told so** over the poster rather
 * than handed a black rectangle with a dead control. See `hlsSupported` below for where an engine
 * plugs in.
 *
 * ## A portal, because the card is inside a scroll container
 *
 * `position: fixed` inside an ancestor that has a transform, filter or `contain` resolves against
 * *that* ancestor rather than the viewport, and a feed card is very likely to sit under one. The
 * portal puts the overlay on `document.body`, where fixed means fixed.
 *
 * ## `z-50`, which is the app's dialog tier
 *
 * The same layer `Dialog` uses, and above the mini-app player at `z-40` (`docs/MINI_APP.md` §7a) —
 * media opened from a card must cover a frame, never sit behind it.
 */
export function PostMediaLightbox({
    images,
    video,
    startIndex = 0,
    onClose,
    post,
    isPremiumReader = false,
    onShare,
    onPrevPost,
    onNextPost,
    positionLabel,
    testId = 'post-lightbox',
}: {
    images: PostImage[]
    video: PostVideo | null
    /** Which image was tapped. Ignored when the lightbox is opened on a video. */
    startIndex?: number
    onClose: () => void
    /**
     * The post the media belongs to — its author and its actions are drawn over the media.
     *
     * Optional, and its absence is what keeps this usable for a **reply's** pictures, which have no
     * post around them and no action row to draw. Same rule every other optional handler on this
     * feature follows: no data, no control.
     */
    post?: Post
    /** Premium readers are exempt from paid interaction — the host's fact, not the post's. */
    isPremiumReader?: boolean
    onShare?: () => void
    /**
     * Page to the neighbouring **post**, supplied by whoever owns the list.
     *
     * The viewer never fetches: a list that can page has already done it once, and a media viewer
     * that learned to paginate would be a fifth copy of the rules in `paged-list.ts`. Absent at
     * either end of what is loaded, which is also how the control knows to disappear.
     */
    onPrevPost?: () => void
    onNextPost?: () => void
    /** `3 / 40`, from the list — the viewer cannot count posts it was handed one of. */
    positionLabel?: string
    testId?: string
}) {
    const { t } = useTranslation()
    const [index, setIndex] = useState(startIndex)
    const [mounted, setMounted] = useState(false)

    // `document` does not exist on the server, so the portal target is resolved after mount.
    useEffect(() => setMounted(true), [])

    const showsVideo = Boolean(videoSrc(video))
    const total = showsVideo ? 1 : images.length

    const step = useCallback(
        (delta: 1 | -1) => {
            if (total <= 1) return
            // Wraps, as legacy's slider does — at the last image, forward returns to the first.
            setIndex(current => (current + delta + total) % total)
        },
        [total],
    )

    /*
     * Escape closes and the arrows page, which is what makes this usable without a pointer — and
     * the reason it is a document listener rather than `onKeyDown` on the overlay: the overlay is
     * not focusable, and making it focusable would put a tab stop on a backdrop.
     */
    useEffect(() => {
        function onKey(event: KeyboardEvent) {
            if (event.key === 'Escape') onClose()
            if (event.key === 'ArrowRight') step(1)
            if (event.key === 'ArrowLeft') step(-1)
            /*
             * Up and down move between **posts**, left and right between one post's pictures. That
             * is the axis legacy's slider uses and it is the one that reads: the pictures are a
             * row, the posts are a column you scroll.
             */
            if (event.key === 'ArrowDown') onNextPost?.()
            if (event.key === 'ArrowUp') onPrevPost?.()
        }
        document.addEventListener('keydown', onKey)
        return () => document.removeEventListener('keydown', onKey)
    }, [onClose, step, onNextPost, onPrevPost])

    /*
     * The page must not scroll behind a fullscreen overlay. Restored to whatever it was rather than
     * to `''`: a dialog underneath this one may already have locked it, and clearing the value
     * would unlock the page while that dialog is still open.
     */
    useEffect(() => {
        const previous = document.body.style.overflow
        document.body.style.overflow = 'hidden'
        return () => {
            document.body.style.overflow = previous
        }
    }, [])

    if (!mounted) return null

    const current = images[index]
    const currentSrc = current?.uri ?? current?.thumb ?? null

    return createPortal(
        <div
            data-testid={testId}
            role="dialog"
            aria-modal="true"
            aria-label={t('post_lightbox_title')}
            className="fixed inset-0 z-50 flex items-center justify-center"
        >
            {/*
             * The backdrop is its **own element behind the content**, not a click handler on the
             * container with `stopPropagation` on the stage.
             *
             * That arrangement is what a lint rule correctly objects to: a `div` carrying `onClick`
             * is a control that cannot be reached by keyboard, and the usual repair — adding
             * `onKeyDown` — puts a tab stop on a backdrop, which is worse. Here the dismiss is a
             * real `button` filling the space *underneath* the media, so it is focusable, it is
             * announced once, and a press on the media never reaches it because the media is
             * painted on top rather than inside it. No `stopPropagation` anywhere.
             */}
            <button
                type="button"
                onClick={onClose}
                aria-label={t('common_close')}
                tabIndex={-1}
                data-testid={subTestId(testId, 'overlay')}
                className="absolute inset-0 cursor-default bg-black/90"
            />

            <button
                type="button"
                onClick={onClose}
                aria-label={t('common_close')}
                data-testid={subTestId(testId, 'close')}
                className="absolute end-4 top-4 z-10 flex size-10 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"
            >
                <Icon name="xmark" size={24} />
            </button>

            <div className="relative flex max-h-full max-w-full items-center justify-center p-4">
                {showsVideo && video ? (
                    <LightboxVideo video={video} testId={subTestId(testId, 'slide')} />
                ) : currentSrc ? (
                    <Image
                        /*
                         * Keyed on the **index**, not the src — the same reason the gallery is
                         * (`post-image-gallery.tsx`). One post can carry the same URL twice, and
                         * keying on it means paging between those two neighbours does not remount,
                         * so the `alt` and the loading state belong to the slide the reader left.
                         */
                        key={index}
                        src={currentSrc}
                        alt={t('post_image_alt')}
                        width={current?.width ?? current?.w ?? 1600}
                        height={current?.height ?? current?.h ?? 1600}
                        sizes="100vw"
                        data-testid={subTestId(testId, 'slide')}
                        className="max-h-[90vh] w-auto max-w-[90vw] object-contain"
                    />
                ) : null}
            </div>

            {post ? (
                /*
                 * The author over the media and the actions under it, both on their own scrim.
                 * `PostHeader` is given no `actions`, so it draws no menu and is not a link — a
                 * press inside a fullscreen viewer that navigated away would throw the viewer out.
                 */
                <div className="pointer-events-none absolute inset-x-0 top-0 z-10 bg-gradient-to-b from-black/70 to-transparent p-4 pb-10">
                    <div className="pointer-events-auto mx-auto w-full max-w-[612px] pe-14 text-white [&_*]:text-white">
                        <PostHeader post={post} testId={subTestId(testId, 'header')} />
                    </div>
                </div>
            ) : null}

            {post ? (
                <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-black/70 to-transparent p-4 pt-10">
                    <div className="pointer-events-auto mx-auto w-full max-w-[612px] text-white [&_*]:text-white">
                        <PostActions
                            post={post}
                            isPremiumReader={isPremiumReader}
                            onShare={onShare}
                            testId={subTestId(testId, 'footer')}
                        />
                    </div>
                </div>
            ) : null}

            {onPrevPost || onNextPost ? (
                <>
                    {/*
                     * The **post** pager, on the vertical axis so it cannot be mistaken for the
                     * picture pager on the horizontal one. Each disappears at its own end of the
                     * list, which is what the absent callback means.
                     */}
                    {onPrevPost ? (
                        <LightboxArrow
                            side="up"
                            label={t('post_slider_previous_post')}
                            onPress={onPrevPost}
                            /*
                             * Scoped under `list`, because `prev`/`next` on this surface already
                             * belong to the **pictures**. The thing this pages is the list of
                             * posts, so it says so rather than borrowing a name that means the
                             * other axis — `docs/TEST_IDS.md` §5 is what that borrowing costs.
                             */
                            testId={subTestId(subTestId(testId, 'list'), 'prev')}
                        />
                    ) : null}
                    {onNextPost ? (
                        <LightboxArrow
                            side="down"
                            label={t('post_slider_next_post')}
                            onPress={onNextPost}
                            testId={subTestId(subTestId(testId, 'list'), 'next')}
                        />
                    ) : null}
                    {positionLabel ? (
                        <span
                            data-testid={subTestId(testId, 'label-data')}
                            className="type-caption-meta absolute top-4 start-4 z-10 rounded-full bg-black/50 px-3 py-1 text-white"
                        >
                            {positionLabel}
                        </span>
                    ) : null}
                </>
            ) : null}

            {total > 1 && (
                <>
                    {/*
                     * `angle-left` / `angle-right`, and they are **not** mirrored for RTL by hand:
                     * the overlay inherits `dir` from `<html>`, so `start`/`end` place them on the
                     * correct sides, and the glyph inside each still has to point outward from the
                     * edge it sits on. That is what `rtl:rotate-180` achieves — the position flips
                     * and the arrow flips with it.
                     */}
                    <LightboxArrow
                        side="start"
                        label={t('common_previous')}
                        onPress={() => step(-1)}
                        testId={subTestId(testId, 'prev')}
                    />
                    <LightboxArrow
                        side="end"
                        label={t('common_next')}
                        onPress={() => step(1)}
                        testId={subTestId(testId, 'next')}
                    />
                    {/*
                     * ⚠ **The picture counter moves when a post is drawn**, because the action row
                     * is where it used to be. Left at `bottom-6` it printed `1 / 11` straight
                     * through the react and comment counts — seen in a screenshot, and not
                     * something either component could have known about the other.
                     */}
                    <span
                        data-testid={subTestId(testId, 'label')}
                        className={cn(
                            'type-caption-meta absolute z-10 start-1/2 -translate-x-1/2 rounded-full bg-white/10 px-3 py-1 text-white rtl:translate-x-1/2',
                            post ? 'bottom-24' : 'bottom-6',
                        )}
                    >
                        {`${index + 1} / ${total}`}
                    </span>
                </>
            )}
        </div>,
        document.body,
    )
}

function LightboxArrow({
    side,
    label,
    onPress,
    testId,
}: {
    /**
     * Which edge it sits on, and therefore which axis it pages.
     *
     * `start`/`end` move between one post's **pictures**; `up`/`down` between **posts**. Two axes
     * rather than one queue of everything, because they are two different questions — "the next
     * picture of this" and "the next post" — and a reader who has learned one axis should not have
     * it silently mean the other at the end of a gallery.
     */
    side: 'start' | 'end' | 'up' | 'down'
    label: string
    onPress: () => void
    testId?: string
}) {
    const vertical = side === 'up' || side === 'down'
    return (
        <button
            type="button"
            onClick={event => {
                event.stopPropagation()
                onPress()
            }}
            aria-label={label}
            data-testid={testId}
            className={cn(
                'absolute z-10 flex size-10 items-center justify-center rounded-full',
                'bg-white/10 text-white hover:bg-white/20',
                vertical
                    ? [
                          /*
                           * Centred horizontally, and `-translate-x-1/2` with its RTL counterpart
                           * for the reason every other centred overlay here needs one: `start-1/2`
                           * flips but a transform does not.
                           */
                          'start-1/2 -translate-x-1/2 rtl:translate-x-1/2',
                          side === 'up' ? 'top-20' : 'bottom-36',
                      ]
                    : ['top-1/2 -translate-y-1/2', side === 'start' ? 'start-4' : 'end-4'],
            )}
        >
            <Icon
                name={vertical ? 'angle-up' : 'angle-left'}
                size={24}
                className={cn(
                    side === 'down' && 'rotate-180',
                    side === 'end' && 'rotate-180',
                    !vertical && 'rtl:rotate-180',
                )}
            />
        </button>
    )
}

/**
 * Whether this browser can play an HLS manifest without help.
 *
 * Safari and the iOS/macOS WebViews answer `'maybe'` or `'probably'`; Chrome and Firefox answer
 * `''`. Both MIME spellings are asked because the type has two registered names and browsers do
 * not agree on which they advertise.
 *
 * **This is the seam for a media engine.** A `hls.js` (or `video.js`) integration goes exactly
 * here: when this answers `false`, attach the engine to the element instead of setting `src`. Until
 * something decides to take that dependency, `false` is surfaced to the reader rather than being
 * allowed to look like a broken video.
 */
function hlsSupported(element: HTMLVideoElement): boolean {
    return Boolean(
        element.canPlayType('application/vnd.apple.mpegurl') ||
            element.canPlayType('application/x-mpegURL'),
    )
}

/** Whether the manifest is HLS at all — a plain MP4 needs none of the above. */
function isHlsSource(src: string): boolean {
    try {
        return new URL(src, 'https://tevi.invalid').pathname.toLowerCase().endsWith('.m3u8')
    } catch {
        return false
    }
}

/**
 * The clip, with iOS's fallback decided before the first frame rather than after a failure.
 *
 * `videoSrc` hands back the manifest (what the native clients play). If this browser cannot play
 * one, the mp4 `videoFallbackSrc` offers is used instead — the web equivalent of `PostVideoView`'s
 * `backupAsset`, which iOS swaps in from an `AVPlayerItem.status == .failed` observer. `post-media.ts`
 * carries the comparison. The notice is what is left when there is no mp4 either, which is the case
 * AVPlayer never reaches.
 */
function LightboxVideo({ video, testId }: { video: PostVideo; testId?: string }) {
    const { t } = useTranslation()
    /** `null` until an element has been measured — see the ref callback. */
    const [useFallback, setUseFallback] = useState(false)
    const [unplayable, setUnplayable] = useState(false)

    const primary = videoSrc(video) ?? ''
    const fallback = videoFallbackSrc(video)
    const src = useFallback && fallback ? fallback : primary
    const poster = video.thumbnail ?? undefined

    /*
     * The check runs on the element, in a ref callback, because `canPlayType` is a method on
     * `HTMLVideoElement` — there is no way to ask it without one. Done here rather than in an
     * effect so the answer is known on the first paint that has an element, which is what keeps the
     * unplayable notice from flashing in after the controls.
     *
     * Measured against `primary`, never `src`: once the fallback is in play `src` is an mp4, and
     * re-measuring it would answer "playable" and say nothing about why we switched.
     */
    const measure = useCallback(
        (element: HTMLVideoElement | null) => {
            if (!element || !primary) return
            const needsEngine = isHlsSource(primary) && !hlsSupported(element)
            setUseFallback(needsEngine && Boolean(fallback))
            setUnplayable(needsEngine && !fallback)
        },
        [primary, fallback],
    )

    if (unplayable) {
        return (
            <div
                data-testid={testId}
                className="flex max-w-[480px] flex-col items-center gap-3 rounded-[12px] bg-white/10 p-6 text-center"
            >
                {poster ? (
                    <Image
                        src={poster}
                        alt=""
                        width={480}
                        height={270}
                        className="w-full rounded-[8px] object-cover"
                    />
                ) : null}
                <p className="type-dense-emphasis text-white">
                    {t('post_video_unsupported_title')}
                </p>
                <p className="type-caption-meta text-white/70">
                    {t('post_video_unsupported_body')}
                </p>
            </div>
        )
    }

    return (
        // biome-ignore lint/a11y/useMediaCaption: captions are the creator's to supply and the payload carries no track; an empty <track> would announce a captions menu with nothing in it.
        <video
            ref={measure}
            data-testid={testId}
            src={src}
            poster={poster}
            controls
            autoPlay
            playsInline
            className="max-h-[90vh] max-w-[90vw]"
        />
    )
}
