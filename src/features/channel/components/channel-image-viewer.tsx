'use client'

import { Dialog as BaseDialog } from '@base-ui/react/dialog'
import { DialogCloseButton } from '@shared/components/dialog-close-button'
import { cn } from '@shared/lib/utils'
import Image from 'next/image'
import { type PointerEvent, useCallback, useEffect, useRef, useState } from 'react'
import {
    containRect,
    DISMISS_DISTANCE,
    DISMISS_VELOCITY,
    dragProgress,
    RESTING_KEYFRAME,
    type Rect,
    sourceKeyframe,
} from '../lib/image-viewer-geometry'

/** The element the image grows out of and shrinks back into, and whether it is drawn as a circle. */
export type ImageViewerOrigin = { el: HTMLElement; round: boolean }

/** What the frame shows while it flies: the bitmap the page already decoded, and its shape. */
type Prepared = { low: string; nw: number; nh: number }

/** The app's one motion curve (`shared/lib/motion.ts`). */
const EASE = 'cubic-bezier(0.32, 0.72, 0, 1)'
const OPEN_MS = 360
const CLOSE_MS = 280
const SETTLE_MS = 240

function rectOf(el: Element): Rect {
    const r = el.getBoundingClientRect()
    return { x: r.left, y: r.top, w: r.width, h: r.height }
}

function radiusOf(origin: ImageViewerOrigin, rect: Rect) {
    return origin.round ? Math.min(rect.w, rect.h) / 2 : 0
}

function prefersReducedMotion() {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/**
 * Run a WAAPI animation and leave its last frame behind as inline style, so the next animation (or
 * a drag) starts from where this one ended rather than from the stylesheet.
 */
async function play(el: HTMLElement, frames: Keyframe[], options: KeyframeAnimationOptions) {
    const animation = el.animate(frames, { fill: 'forwards', ...options })
    try {
        await animation.finished
        animation.commitStyles()
    } catch {
        // Cancelled — the element left the document mid-flight. Nothing to keep.
    }
    animation.cancel()
}

/**
 * The bitmap to fly with. The page's own `<img>` is already decoded at the size it is drawn, so
 * starting from it costs no request and no blank frame; the full-size original is layered on once
 * the frame has landed. With no usable `<img>` (an avatar still loading) the original is decoded
 * first — the open waits for it rather than flying an empty box.
 */
async function prepare(origin: ImageViewerOrigin, src: string): Promise<Prepared> {
    const img = origin.el.querySelector('img')
    if (img?.complete && img.naturalWidth > 0) {
        return { low: img.currentSrc || img.src, nw: img.naturalWidth, nh: img.naturalHeight }
    }
    const probe = new window.Image()
    probe.src = src
    await probe.decode().catch(() => undefined)
    return { low: src, nw: probe.naturalWidth, nh: probe.naturalHeight }
}

/**
 * The space's avatar or cover, full screen — legacy's `channel/components/common/viewImage`, which
 * it built and then never opened (both of its triggers `preventDefault`).
 *
 * ## A shared-element zoom, not a dialog that fades in
 *
 * The image grows **out of the thing that was pressed** — from the avatar's circle or the cover band
 * to the image contained in the viewport — and shrinks back into it on the way out, to wherever it
 * now is. The page's copy is hidden meanwhile, so there is one image on screen, travelling, never
 * two. The geometry is `lib/image-viewer-geometry.ts`: the frame is laid out once at its final rect
 * and every other state is a composited `transform` + `clip-path` off it, which is what keeps the
 * flight smooth on a phone.
 *
 * - **Drag down (or up) to dismiss.** The image follows the pointer, shrinks a little, and the black
 *   thins out; let go past 120px or with a flick and it flies home, otherwise it settles back.
 * - **A press on the black closes it**, as do `Esc` and the close disc.
 * - **Reduced motion** gets a 150ms fade and no travel.
 * - **If the origin has scrolled away** (or is gone), the close fades and shrinks in place rather
 *   than flying to somewhere off screen.
 *
 * ## Built on base-ui's dialog parts rather than `DialogContent`
 *
 * `DialogContent` is the DS card — centred, padded, with its own scale-in. This is none of that, and
 * overriding all of it from a call site would be a longer list than the parts themselves. What is
 * kept is everything base-ui gives a modal: the focus trap, the scroll lock, `Esc`, and focus handed
 * back to the avatar or cover that opened it. The root stays open until the close animation has
 * finished, so base-ui never unmounts a frame that is still in flight.
 *
 * Contained for the avatar too, not legacy's 260px circle: an avatar is not guaranteed square (see
 * `shared/lib/thumbor.ts` — a real one measures 1015×338), and a circle would hide exactly the part
 * the reader opened the viewer to see.
 */
export function ChannelImageViewer({
    origin,
    src,
    label,
    onClose,
}: {
    /** Set to open. The caller clears it in `onClose`, which fires once the image is home. */
    origin: ImageViewerOrigin | null
    /** The full-size original. */
    src: string | null
    /** The dialog's accessible name — "Profile picture" / "Cover image". */
    label: string
    onClose: () => void
}) {
    const [prepared, setPrepared] = useState<Prepared | null>(null)
    /** The flight has landed: time to fetch the original and lay it over the page's bitmap. */
    const [settled, setSettled] = useState(false)
    const [hiLoaded, setHiLoaded] = useState(false)

    const frameRef = useRef<HTMLDivElement>(null)
    const backdropRef = useRef<HTMLDivElement>(null)
    const chromeRef = useRef<HTMLDivElement>(null)
    const targetRef = useRef<Rect | null>(null)
    const closingRef = useRef(false)
    const dragRef = useRef<{
        y0: number
        dy: number
        active: boolean
        lastY: number
        lastT: number
        velocity: number
    } | null>(null)

    useEffect(() => {
        if (!origin || !src) return
        let live = true
        closingRef.current = false
        void prepare(origin, src).then(next => {
            if (live) setPrepared(next)
        })
        return () => {
            live = false
            // Unmounted mid-flight (a navigation): never leave the page's copy hidden.
            origin.el.style.visibility = ''
        }
    }, [origin, src])

    /*
     * The open, run from a callback ref on the layer that holds all three parts — base-ui mounts
     * the popup through a portal, possibly a render after `prepared` is set, so an effect keyed on
     * `prepared` can find nothing to animate. A ref callback fires in the commit the node lands in,
     * after its children's refs and before paint, so the frame is never seen at its final rect first.
     */
    const startOpen = useCallback(
        (layer: HTMLDivElement | null) => {
            const frame = frameRef.current
            const backdrop = backdropRef.current
            const chrome = chromeRef.current
            if (!layer || !frame || !backdrop || !chrome || !origin || !prepared) return

            const target = containRect(prepared.nw, prepared.nh, innerWidth, innerHeight)
            targetRef.current = target
            place(frame, target)

            const source = rectOf(origin.el)
            origin.el.style.visibility = 'hidden'

            if (prefersReducedMotion()) {
                const fade = { duration: 150, easing: 'linear' }
                void play(backdrop, [{ opacity: 0 }, { opacity: 1 }], fade)
                void play(chrome, [{ opacity: 0 }, { opacity: 1 }], fade)
                void play(frame, [{ opacity: 0 }, { opacity: 1 }], fade).then(() =>
                    setSettled(true),
                )
                return
            }

            void play(backdrop, [{ opacity: 0 }, { opacity: 1 }], {
                duration: OPEN_MS,
                easing: 'ease-out',
            })
            void play(chrome, [{ opacity: 0 }, { opacity: 1 }], {
                duration: 200,
                delay: OPEN_MS - 120,
                easing: 'linear',
            })
            void play(
                frame,
                [sourceKeyframe(target, source, radiusOf(origin, source)), RESTING_KEYFRAME],
                { duration: OPEN_MS, easing: EASE },
            ).then(() => setSettled(true))
        },
        [origin, prepared],
    )

    // A rotated phone or a resized window: re-contain, no animation.
    useEffect(() => {
        if (!prepared) return
        const onResize = () => {
            const frame = frameRef.current
            if (!frame || closingRef.current) return
            const target = containRect(prepared.nw, prepared.nh, innerWidth, innerHeight)
            targetRef.current = target
            place(frame, target)
        }
        window.addEventListener('resize', onResize)
        return () => window.removeEventListener('resize', onResize)
    }, [prepared])

    const close = useCallback(async () => {
        const frame = frameRef.current
        const backdrop = backdropRef.current
        const chrome = chromeRef.current
        if (closingRef.current || !origin || !frame || !backdrop || !chrome) return
        closingRef.current = true
        dragRef.current = null

        const target = targetRef.current
        const home = origin.el.isConnected ? rectOf(origin.el) : null
        const homeOnScreen =
            home !== null && home.w > 0 && home.y + home.h > 0 && home.y < innerHeight
        // Where the frame is now — at rest, wherever a drag left it, or mid-open.
        const computed = getComputedStyle(frame)
        const current =
            computed.transform === 'none' ? String(RESTING_KEYFRAME.transform) : computed.transform
        const currentClip =
            computed.clipPath === 'none' ? String(RESTING_KEYFRAME.clipPath) : computed.clipPath
        const reduced = prefersReducedMotion()

        void play(chrome, [{ opacity: Number(getComputedStyle(chrome).opacity) }, { opacity: 0 }], {
            duration: 120,
            easing: 'linear',
        })
        const fadeOut = play(
            backdrop,
            [{ opacity: Number(getComputedStyle(backdrop).opacity) }, { opacity: 0 }],
            { duration: reduced ? 150 : CLOSE_MS, easing: 'ease-in' },
        )
        const flight =
            !reduced && homeOnScreen && target
                ? play(
                      frame,
                      [
                          { transform: current, clipPath: currentClip },
                          sourceKeyframe(target, home, radiusOf(origin, home)),
                      ],
                      { duration: CLOSE_MS, easing: EASE },
                  )
                : play(
                      frame,
                      [
                          { transform: current, opacity: 1 },
                          { transform: `${current} scale(0.92)`, opacity: 0 },
                      ],
                      { duration: reduced ? 150 : 200, easing: 'ease-in' },
                  )
        await Promise.all([fadeOut, flight])

        origin.el.style.visibility = ''
        setPrepared(null)
        setSettled(false)
        setHiLoaded(false)
        onClose()
    }, [origin, onClose])

    const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
        if (closingRef.current || event.button !== 0) return
        event.currentTarget.setPointerCapture(event.pointerId)
        dragRef.current = {
            y0: event.clientY,
            dy: 0,
            active: false,
            lastY: event.clientY,
            lastT: performance.now(),
            velocity: 0,
        }
    }

    const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
        const drag = dragRef.current
        const frame = frameRef.current
        const backdrop = backdropRef.current
        const chrome = chromeRef.current
        if (!drag || !frame || !backdrop || !chrome) return
        const dy = event.clientY - drag.y0
        // A few pixels of slop, so a tap that wobbles is still a tap.
        if (!drag.active && Math.abs(dy) < 6) return
        drag.active = true

        const now = performance.now()
        if (now > drag.lastT) drag.velocity = (event.clientY - drag.lastY) / (now - drag.lastT)
        drag.lastY = event.clientY
        drag.lastT = now
        drag.dy = dy

        const progress = dragProgress(dy)
        frame.style.transform = `translate(0px, ${dy}px) scale(${1 - progress * 0.25})`
        backdrop.style.opacity = String(1 - progress)
        chrome.style.opacity = String(1 - Math.min(progress * 3, 1))
    }

    const onPointerEnd = () => {
        const drag = dragRef.current
        dragRef.current = null
        const frame = frameRef.current
        const backdrop = backdropRef.current
        const chrome = chromeRef.current
        if (!drag?.active || !frame || !backdrop || !chrome) return

        if (Math.abs(drag.dy) > DISMISS_DISTANCE || Math.abs(drag.velocity) > DISMISS_VELOCITY) {
            void close()
            return
        }
        const settle = { duration: SETTLE_MS, easing: EASE }
        void play(frame, [{ transform: frame.style.transform }, RESTING_KEYFRAME], settle)
        void play(backdrop, [{ opacity: Number(backdrop.style.opacity) }, { opacity: 1 }], settle)
        void play(chrome, [{ opacity: Number(chrome.style.opacity) }, { opacity: 1 }], settle)
    }

    return (
        <BaseDialog.Root
            open={prepared !== null}
            onOpenChange={open => {
                if (!open) void close()
            }}
        >
            <BaseDialog.Portal>
                <BaseDialog.Popup
                    data-testid="channel-image-viewer"
                    className="fixed inset-0 z-50 overflow-hidden outline-none"
                >
                    <BaseDialog.Title className="sr-only">{label}</BaseDialog.Title>
                    <div ref={startOpen} className="contents">
                        {/* The black, and the hit target for "press outside to close". */}
                        <div
                            ref={backdropRef}
                            aria-hidden="true"
                            onClick={() => void close()}
                            className="absolute inset-0 bg-(--black) opacity-0"
                        />
                        <div
                            ref={frameRef}
                            onPointerDown={onPointerDown}
                            onPointerMove={onPointerMove}
                            onPointerUp={onPointerEnd}
                            onPointerCancel={onPointerEnd}
                            className="fixed origin-center touch-none select-none overflow-hidden will-change-transform"
                        >
                            {prepared && (
                                // biome-ignore lint/performance/noImgElement: the page's own already-optimised, decoded bitmap — `next/image` would request another
                                <img
                                    src={prepared.low}
                                    alt=""
                                    draggable={false}
                                    className="absolute inset-0 size-full object-cover"
                                />
                            )}
                            {settled && src && (
                                <Image
                                    src={src}
                                    alt=""
                                    fill
                                    sizes="100vw"
                                    draggable={false}
                                    onLoad={() => setHiLoaded(true)}
                                    className={cn(
                                        'object-cover transition-opacity duration-200',
                                        hiLoaded ? 'opacity-100' : 'opacity-0',
                                    )}
                                />
                            )}
                        </div>
                        <div
                            ref={chromeRef}
                            className="pointer-events-none absolute inset-x-0 top-0 flex justify-end p-2 pt-[max(8px,env(safe-area-inset-top))] opacity-0"
                        >
                            {/* Last in the DOM, so initial focus does not land on the way out (DESIGN_SYSTEM §7). */}
                            <DialogCloseButton
                                data-testid="channel-image-viewer-close"
                                className="pointer-events-auto bg-(--opacity-black-50) text-(--white) hover:not-disabled:bg-(--opacity-black-75)"
                            />
                        </div>
                    </div>
                </BaseDialog.Popup>
            </BaseDialog.Portal>
        </BaseDialog.Root>
    )
}

/** The frame's layout box — viewport pixels, which is what `getBoundingClientRect` speaks. */
function place(frame: HTMLElement, rect: Rect) {
    frame.style.left = `${rect.x}px`
    frame.style.top = `${rect.y}px`
    frame.style.width = `${rect.w}px`
    frame.style.height = `${rect.h}px`
}
