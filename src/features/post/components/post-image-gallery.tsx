'use client'

import { useTranslation } from '@shared/i18n/use-translation'
import { subTestId } from '@shared/lib/test-id'
import { Icon } from '@shared/ui/icon'
import Image from 'next/image'
import { useCallback, useRef, useState } from 'react'
import type { PostImage } from '../api/types'
import { detectAspectRatio, gallerySlideRatio, POST_COLUMN_SIZES } from '../lib/post-media'

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
 * A single image does not join the row — it takes the full width at its own snapped ratio
 * (`detectAspectRatio`), which is the shape the feed is built around.
 */
export function PostImageGallery({
    images,
    onOpen,
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
    testId?: string
}) {
    const { t } = useTranslation()
    const scrollerRef = useRef<HTMLDivElement>(null)
    const [atStart, setAtStart] = useState(true)
    const [atEnd, setAtEnd] = useState(false)

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

    const scrollBy = useCallback((direction: 1 | -1) => {
        const el = scrollerRef.current
        if (!el) return
        el.scrollBy({ left: direction * el.clientWidth * 0.8, behavior: 'smooth' })
    }, [])

    if (images.length === 0) return null

    if (images.length === 1) {
        const only = images[0]
        const src = only.uri ?? only.thumb
        if (!src) return null
        const Frame = onOpen ? 'button' : 'div'
        return (
            <Frame
                {...(onOpen
                    ? {
                          type: 'button' as const,
                          onClick: () => onOpen(0),
                          'aria-label': t('post_image_open'),
                      }
                    : {})}
                data-testid={testId}
                className="relative w-full overflow-hidden rounded-[8px] bg-(--background-segment)"
                style={{ aspectRatio: detectAspectRatio(only) }}
            >
                <Image
                    src={src}
                    alt={t('post_image_alt')}
                    fill
                    sizes={POST_COLUMN_SIZES}
                    className="object-cover"
                />
            </Frame>
        )
    }

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
                className="flex h-[260px] snap-x gap-1 overflow-x-auto overscroll-x-contain [-ms-overflow-style:none] [scrollbar-width:none] md:h-[310px] [&::-webkit-scrollbar]:hidden"
            >
                {images.map((image, index) => {
                    const src = image.uri ?? image.thumb
                    const Tile = onOpen ? 'button' : 'div'
                    return (
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
                            // biome-ignore lint/suspicious/noArrayIndexKey: order is the only identity these rows have — see above.
                            key={index}
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
                            className="relative h-full flex-none snap-start overflow-hidden rounded-[8px] bg-(--background-segment)"
                            style={{ aspectRatio: gallerySlideRatio(image) }}
                        >
                            {src ? (
                                <Image
                                    src={src}
                                    alt={t('post_image_alt')}
                                    fill
                                    sizes="(max-width: 768px) 100vw, 33vw"
                                    className="object-cover"
                                />
                            ) : null}
                        </Tile>
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
