'use client'

import { useTranslation } from '@shared/i18n/use-translation'
import { subTestId } from '@shared/lib/test-id'
import { cn } from '@shared/lib/utils'
import { Icon } from '@shared/ui/icon'
import Image from 'next/image'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { PostImage } from '../api/types'
import { gallerySlideRatio, isLocalImageSrc } from '../lib/post-media'

/**
 * A post's images — one image sized by its own ratio, several as a horizontal row.
 *
 * ## A scrolling row, not a carousel
 *
 * Legacy mounts a **Swiper** here, with 180 lines of styling whose job is to stop that Swiper from
 * fighting the Swiper the page already has: `touchAction: pan-x`, `zIndex: 99999`, `isolation`,
 * `translate3d` and a pair of handlers that reach into `document.querySelectorAll('.swiper')` to
 * disable every other instance on the page while this one is being dragged. All of that is the cost
 * of using a transform track for something the browser already does.
 *
 * `docs/DESIGN_SYSTEM.md` §10 draws the line this repo follows: a row you scroll sideways is
 * `overflow-x-auto` + `snap-x`, and Embla (this app's only carousel engine) is for real *slide*
 * semantics. A post's images are a row — no dots, no "go to slide 3", no autoplay — so they are
 * native scroll, which keeps momentum, `overscroll-behavior`, and the browser scrolling a focused
 * image into view. None of those survive a transform track.
 *
 * ## One height, many widths
 *
 * The geometry is legacy's and it is the thing that makes a mixed-ratio row work: every slide is
 * **260px tall on mobile and 310 on desktop**, and each is as wide as its own aspect ratio makes it
 * at that height. Letterboxing is what the alternative costs.
 *
 * ## ⚠ A single image joins the row too, and it did not
 *
 * This had a branch drawing **one** image at full width and its own snapped ratio. Legacy has no
 * such branch: `ImageGallery` puts every image, however many, in the fixed-height row and derives
 * each width from its ratio (`getSlideWidth(image, commonHeight)`).
 *
 * The divergence was not cosmetic. `detectAspectRatio` snaps as far as `3/4`, so a portrait photo
 * on its own became **612 × 816** in a 612px column — taller than the viewport on most laptops, so
 * the card's own actions scrolled off under it. Every other shape was fine, which is why it
 * survived: it is only wrong for the one aspect ratio phones produce most.
 *
 * `max-w-[90%]` per slide is legacy's too, and it is what stops a panorama filling the row edge to
 * edge with nothing to suggest more follows.
 *
 * ## The composer draws the same figure, shorter
 *
 * `size="compact"` is 200/300 instead of 260/310 — legacy's `ImagePreview`, which is this same row
 * with one number changed. It was a strip of 96px squares here, which is a different thing: a
 * contact sheet shows you *that* you attached four pictures, a gallery shows you what each one will
 * look like, and the composer's job is the second. In compact the row is used for **one** image
 * too, where the feed would go full width — a picture in a dialog beside a caption is not the shape
 * the feed is built around.
 *
 * ## `tight` is shorter than legacy, on purpose
 *
 * 160/240, and it is the one size here with **no** legacy counterpart: `btnUploadMedia`'s preview is
 * `{ xs: 200, md: 300 }`, the same as the post composer's. The reply popup asked for less because
 * it is a different envelope — the quoted post is above the box and the keyboard is below it, so a
 * 300px preview pushes both out of view on the surface where the reader is actually typing. A
 * product call, taken knowingly against parity; the post composer keeps legacy's number.
 */
/** One place for the three row heights, so a fourth caller cannot invent a fourth number inline. */
const ROW_HEIGHT = {
    default: 'h-[260px] md:h-[310px]',
    compact: 'h-[200px] md:h-[300px]',
    tight: 'h-[160px] md:h-[240px]',
} as const

export function PostImageGallery({
    images,
    onOpen,
    onRemove,
    size = 'default',
    testId,
}: {
    images: PostImage[]
    /**
     * Open this image full size — legacy's `handleViewImageSlide`, which passes the tapped index.
     *
     * Optional, and its absence is deliberate rather than a convenience: without it each tile is a
     * plain `div` and not a button, so a surface that cannot open a lightbox does not grow a row of
     * focusable elements that do nothing. Legacy has no such distinction and every image is
     * clickable everywhere, including in previews.
     */
    onOpen?: (index: number) => void
    /**
     * Take this one off — the composer's only addition to the feed's gallery.
     *
     * Its disc is a **sibling** of the tile rather than a child, so it stays valid markup when
     * `onOpen` also makes that tile a `<button>`: a button inside a button is markup browsers
     * resolve by breaking one of the two. No call site passes both today; the arrangement means one
     * could.
     */
    onRemove?: (index: number) => void
    /** `compact` is the composer's 200/300 row, `tight` the reply box's 160/240 — see the note above. */
    size?: 'default' | 'compact' | 'tight'
    testId?: string
}) {
    const { t } = useTranslation()
    const scrollerRef = useRef<HTMLDivElement>(null)
    const [atStart, setAtStart] = useState(true)
    /*
     * ⚠ **Starts `true`, so a row that does not scroll draws no arrow.** It started `false`, which
     * was invisible while a single image had its own full-width branch — nothing reached the
     * arrows with one slide. The moment one image joined the row, a *next* arrow appeared on every
     * single-image post, pointing at nothing, until the reader scrolled a row that cannot scroll.
     * Caught in a screenshot, not by a type.
     */
    const [atEnd, setAtEnd] = useState(true)

    /**
     * The arrows exist only when there is somewhere to go, and that is read off the element rather
     * than computed from the image widths — the container's width is not known until it is laid
     * out, and a row of four narrow images may not overflow at all.
     */
    const syncEdges = useCallback(() => {
        const el = scrollerRef.current
        if (!el) return
        const max = el.scrollWidth - el.clientWidth
        setAtStart(el.scrollLeft <= 1)
        setAtEnd(el.scrollLeft >= max - 1)
    }, [])

    /**
     * Measure once the row exists, and again whenever it is resized.
     *
     * `onScroll` alone only ever corrects the state **after** a scroll, so the first paint is
     * whatever the initial values happen to be — right for a row that overflows and wrong for one
     * that does not. A `ResizeObserver` covers the two ways the answer changes without a scroll: a
     * page that reflows, and images that arrive and widen the track.
     */
    useEffect(() => {
        const el = scrollerRef.current
        if (!el) return
        syncEdges()
        if (typeof ResizeObserver === 'undefined') return
        const observer = new ResizeObserver(syncEdges)
        observer.observe(el)
        return () => observer.disconnect()
    }, [syncEdges])

    const scrollBy = useCallback((direction: 1 | -1) => {
        const el = scrollerRef.current
        if (!el) return
        el.scrollBy({ left: direction * el.clientWidth * 0.8, behavior: 'smooth' })
    }, [])

    if (images.length === 0) return null

    const rowHeight = ROW_HEIGHT[size]

    return (
        <div data-testid={testId} className="group relative w-full">
            <div
                ref={scrollerRef}
                onScroll={syncEdges}
                /*
                 * `snap-x` without `snap-mandatory`: the slides are different widths, so forcing a
                 * snap point would jump a narrow image past the one the reader was looking at.
                 * `[scrollbar-width:none]` because the row is short and a scrollbar under a 260px
                 * image reads as a rendering fault rather than an affordance.
                 */
                className={cn(
                    'flex snap-x gap-1 overflow-x-auto overscroll-x-contain',
                    '[-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
                    rowHeight,
                )}
            >
                {images.map((image, index) => {
                    const src = image.uri ?? image.thumb
                    const Tile = onOpen ? 'button' : 'div'
                    return (
                        /*
                         * The slide's **box** — the ratio, the row height and the snap point live
                         * here so the tile and its remove disc are siblings inside it. See
                         * `onRemove`'s note for why that nesting is the one that works.
                         */
                        <div
                            // biome-ignore lint/suspicious/noArrayIndexKey: order is the only identity these rows have — see the tile below.
                            key={index}
                            /*
                             * `max-w-[90%]` is legacy's own (`maxWidth: '90%'` on each slide), and
                             * it is what stops a wide panorama filling the row edge to edge with
                             * no hint that anything follows it.
                             */
                            className="relative h-full max-w-[90%] flex-none snap-start"
                            style={{ aspectRatio: gallerySlideRatio(image) }}
                        >
                            <Tile
                                /*
                                 * Keyed on the **index alone**, and `src` is deliberately not in it.
                                 *
                                 * A post's images carry no id, so order is the only identity they have —
                                 * and the same URL can legitimately appear twice in one post (a creator
                                 * repeating a frame, or the same asset uploaded twice). Keying on `src`
                                 * made those two tiles collide: React warns about duplicate keys and is
                                 * free to drop or duplicate one of them.
                                 *
                                 * Index keys are the wrong default when a list can be reordered,
                                 * inserted into or filtered — none of which happens here. This array is
                                 * a fixed property of one immutable post; nothing in the app mutates it,
                                 * and a post whose images changed arrives as a different post.
                                 */
                                {...(onOpen
                                    ? {
                                          type: 'button' as const,
                                          onClick: () => onOpen(index),
                                          'aria-label': t('post_image_open'),
                                      }
                                    : {})}
                                /*
                                 * The index rides a **companion attribute**, never the testid:
                                 * `docs/TEST_IDS.md` bars interpolating a value into an id, and a
                                 * position is a value. A test addresses the row and reads this.
                                 */
                                data-media-index={index}
                                className="relative block size-full overflow-hidden rounded-[8px] bg-(--background-segment)"
                            >
                                {src ? (
                                    <Image
                                        src={src}
                                        alt={t('post_image_alt')}
                                        fill
                                        sizes="(max-width: 768px) 100vw, 33vw"
                                        unoptimized={isLocalImageSrc(src)}
                                        className="object-cover"
                                    />
                                ) : null}
                            </Tile>

                            {/*
                             * Legacy's disc: 28px, `rgba(0,0,0,0.6)`, a 16px white cross, inset 8.
                             * Fixed black rather than a token for `LockPill`'s reason — it sits on an
                             * arbitrary photograph, so it has to be legible against whatever was
                             * uploaded rather than against the page.
                             */}
                            {onRemove ? (
                                <button
                                    type="button"
                                    data-testid={subTestId(testId, 'remove')}
                                    aria-label={t('post_create_remove_image')}
                                    onClick={() => onRemove(index)}
                                    className="absolute end-2 top-2 flex size-7 items-center justify-center rounded-full bg-black/60 text-white transition-colors hover:bg-black/80"
                                >
                                    <Icon name="xmark" size={16} />
                                </button>
                            ) : null}
                        </div>
                    )
                })}
            </div>

            {/*
             * Pointer-only, and hidden from assistive tech: the row is already scrollable by
             * keyboard and by touch, so these are a mouse convenience and announcing them would be
             * two extra stops on the way past a post.
             */}
            {!atStart && (
                <GalleryArrow
                    side="start"
                    onPress={() => scrollBy(-1)}
                    testId={subTestId(testId, 'prev')}
                />
            )}
            {!atEnd && (
                <GalleryArrow
                    side="end"
                    onPress={() => scrollBy(1)}
                    testId={subTestId(testId, 'next')}
                />
            )}
        </div>
    )
}

/** 32px disc, `rgba(0,0,0,0.5)`, inset 8px — legacy's `NavigationButton`, verbatim. */
function GalleryArrow({
    side,
    onPress,
    testId,
}: {
    side: 'start' | 'end'
    onPress: () => void
    testId?: string
}) {
    return (
        <button
            type="button"
            tabIndex={-1}
            aria-hidden="true"
            data-testid={testId}
            onClick={onPress}
            className={`absolute top-1/2 hidden size-8 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-white transition-colors hover:bg-black/70 md:flex ${
                side === 'start' ? 'start-2' : 'end-2'
            }`}
        >
            <Icon name={side === 'start' ? 'angle-left' : 'angle-right'} size={16} />
        </button>
    )
}
