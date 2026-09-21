'use client'

import { useTranslation } from '@shared/i18n/use-translation'
import { subTestId } from '@shared/lib/test-id'
import { Icon } from '@shared/ui/icon'
import Image from 'next/image'
import { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import type { PostImage, PostVideo } from '../api/types'

/**
 * Media at full size — legacy's `ViewMediaSlide`, at the scope a card actually needs.
 *
 * ## What it is, and the one thing it deliberately is not
 *
 * A fullscreen overlay over **this post's** media: every image, arrow- and keyboard-navigable, plus
 * the video. Legacy's version also pages forward into the *next posts in the feed*
 * (`handleGetNextPosts`, `handleGetPostsHome`, a `typePost` discriminator and its own pagination),
 * and that half is not here — it needs a feed to page through, and this app has none yet. Building
 * it now would mean guessing the shape of three lists that do not exist, which is exactly what
 * `post-api.ts` refuses to do for the same reason.
 *
 * ⚠ **The video plays HLS, and one browser family can do that unaided.**
 *
 * `video.playback` is an `.m3u8` manifest. Safari (and iOS WebViews) play it natively; Chrome and
 * Firefox do **not** without a media-source engine — legacy dynamic-imports **video.js** for
 * exactly this. Adding one is a dependency decision of the same weight as `embla` or
 * `react-day-picker` — the sort `CLAUDE.md` records as "the app's only X engine" — so it is not
 * taken here. What is here instead is honest: `canPlayType` is asked, and a browser that cannot
 * play the manifest is **told so** over the poster rather than being handed a black rectangle with
 * a dead control. See `hlsSupported` below for where an engine plugs in.
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
    testId = 'post-lightbox',
}: {
    images: PostImage[]
    video: PostVideo | null
    /** Which image was tapped. Ignored when the lightbox is opened on a video. */
    startIndex?: number
    onClose: () => void
    testId?: string
}) {
    const { t } = useTranslation()
    const [index, setIndex] = useState(startIndex)
    const [mounted, setMounted] = useState(false)

    // `document` does not exist on the server, so the portal target is resolved after mount.
    useEffect(() => setMounted(true), [])

    const showsVideo = Boolean(video?.playback)
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
        }
        document.addEventListener('keydown', onKey)
        return () => document.removeEventListener('keydown', onKey)
    }, [onClose, step])

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
                    <span
                        data-testid={subTestId(testId, 'label')}
                        className="type-caption-meta absolute bottom-6 start-1/2 -translate-x-1/2 rounded-full bg-white/10 px-3 py-1 text-white rtl:translate-x-1/2"
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
    side: 'start' | 'end'
    label: string
    onPress: () => void
    testId?: string
}) {
    return (
        <button
            type="button"
            onClick={event => {
                event.stopPropagation()
                onPress()
            }}
            aria-label={label}
            data-testid={testId}
            className={`absolute top-1/2 flex size-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 ${
                side === 'start' ? 'start-4' : 'end-4'
            }`}
        >
            <Icon
                name={side === 'start' ? 'angle-left' : 'angle-right'}
                size={24}
                className="rtl:rotate-180"
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

function LightboxVideo({ video, testId }: { video: PostVideo; testId?: string }) {
    const { t } = useTranslation()
    const [unplayable, setUnplayable] = useState(false)
    const src = video.playback ?? ''
    const poster = video.thumbnail ?? undefined

    /*
     * The check runs on the element, in a ref callback, because `canPlayType` is a method on
     * `HTMLVideoElement` — there is no way to ask it without one. Done here rather than in an
     * effect so the answer is known on the first paint that has an element, which is what keeps the
     * unplayable notice from flashing in after the controls.
     */
    const measure = useCallback(
        (element: HTMLVideoElement | null) => {
            if (!element || !src) return
            setUnplayable(isHlsSource(src) && !hlsSupported(element))
        },
        [src],
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
