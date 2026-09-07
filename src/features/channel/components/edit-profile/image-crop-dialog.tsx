'use client'

import { useTranslation } from '@shared/i18n/use-translation'
import { cn } from '@shared/lib/utils'
import { Button } from '@shared/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@shared/ui/dialog'
import { Icon } from '@shared/ui/icon'
import { Loader } from '@shared/ui/loader'
import { useCallback, useRef, useState } from 'react'
import {
    clampOffset,
    cropRect,
    displayedSize,
    MAX_ZOOM,
    MIN_ZOOM,
    type Offset,
    renderCrop,
    type Size,
    zoomOffset,
} from '../../lib/image-crop'

/**
 * Pick the part of a picture that becomes the avatar or the cover.
 *
 * The geometry is all in `lib/image-crop.ts` and unit-tested there; this file owns the four things
 * a component has to: measuring the window, following the pointers, drawing the mask, and
 * producing the blob.
 *
 * ## Why this app has its own cropper
 *
 * Legacy uses `react-image-crop`; this repo has neither that dependency nor a design-system
 * component to reach for — the DS ships **no** file upload, card media or media player family,
 * which `docs/DESIGN_SYSTEM.md` states outright. What a cropper actually needs is pan and zoom
 * inside a fixed-aspect window, which is one formula per direction.
 *
 * ## The bug this file was rewritten for
 *
 * The frame used to be measured in a `useLayoutEffect(…, [])`. That effect runs when *this*
 * component mounts — but the frame lives inside `DialogContent`, which base-ui renders through a
 * portal **only while the dialog is open**. So on mount the ref was `null`, the effect bailed and
 * never re-ran, `viewport` stayed `{0, 0}`, `coverScale` divided into zero and the image was drawn
 * at 0×0. The dialog opened onto an empty grey box, every time.
 *
 * The fix is the general one for measuring anything inside a portal: a **callback ref**, which
 * fires when the node actually enters and leaves the DOM rather than when its owner mounts. The
 * `ResizeObserver` and the non-passive `wheel` listener are attached in the same place, so all
 * three follow the node's real lifetime.
 *
 * ## What makes it feel like a cropper rather than two sliders
 *
 * - **Anchored zoom.** Wheel zooms toward the cursor, pinch toward the midpoint of the fingers,
 *   slider and buttons toward the centre (`zoomOffset`). Zooming to the centre regardless is the
 *   single thing that makes a cropper feel broken — the subject you are zooming into slides away.
 * - **A round mask for a round avatar.** Avatars render as circles everywhere in this app, so a
 *   square preview is a lie about which corners survive. The mask is a real circle with the rest
 *   of the frame dimmed; the *crop* is still the square, because that is what gets uploaded.
 * - **Thirds guides while dragging**, and only while dragging. A permanent grid is clutter; a grid
 *   that appears under the finger is a placement aid.
 * - **The picture is dimmed outside the frame, never cut off inside it.** Cover-fitting at
 *   `zoom = 1` means no state can produce a transparent gap in the output.
 *
 * ## Keyboard, and why it is not a nicety here
 *
 * The whole interaction is a drag, which is unusable without a pointer. Arrow keys pan (16px, 64
 * with Shift), `+` / `-` zoom, and the zoom is also a real `<input type="range">` — so the control
 * is fully operable from the keyboard. The frame takes `role="application"` for one reason: it is
 * what stops a screen reader from swallowing the arrow keys for its own reading cursor.
 */

export function ImageCropDialog({
    open,
    onOpenChange,
    src,
    /** The file's MIME type — decides whether the output keeps its alpha channel. */
    type,
    aspect,
    /** `round` draws the circular mask an avatar is really shown through. */
    shape = 'rect',
    title,
    onCropped,
}: {
    open: boolean
    onOpenChange: (open: boolean) => void
    src: string | null
    type: string
    aspect: number
    shape?: 'rect' | 'round'
    title: string
    onCropped: (blob: Blob) => void
}) {
    const { t } = useTranslation()
    const imageRef = useRef<HTMLImageElement>(null)

    const [natural, setNatural] = useState<Size | null>(null)
    const [viewport, setViewport] = useState<Size>({ width: 0, height: 0 })
    const [zoom, setZoom] = useState(MIN_ZOOM)
    const [offset, setOffset] = useState<Offset>({ x: 0, y: 0 })
    const [dragging, setDragging] = useState(false)
    const [busy, setBusy] = useState(false)

    /*
     * A new picture is a new crop. Adjusted **during render** rather than in an effect: React
     * documents this as the way to reset state when a prop changes, and an effect would paint the
     * new image once at the old one's zoom and pan before correcting itself — a visible jump on
     * every second pick.
     */
    const [lastSrc, setLastSrc] = useState(src)
    if (src !== lastSrc) {
        setLastSrc(src)
        setNatural(null)
        setZoom(MIN_ZOOM)
        setOffset({ x: 0, y: 0 })
    }

    /**
     * The live values, for handlers that are attached to the DOM rather than re-created per render.
     *
     * The `wheel` listener has to be registered non-passively (see `attachFrame`), so it is bound
     * once and cannot close over `zoom` / `offset`. Reading them from a ref is the alternative to
     * re-attaching the listener on every state change, which would mean adding and removing a DOM
     * listener sixty times a second during a pinch.
     */
    const live = useRef({ natural, viewport, zoom, offset })
    live.current = { natural, viewport, zoom, offset }

    /** Zoom toward a point, keeping whatever is under it where it is. */
    const zoomTo = useCallback((next: number, focal: Offset = { x: 0, y: 0 }) => {
        const { natural: image, viewport: frame, zoom: current, offset: pan } = live.current
        const value = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, next))
        if (value === current) return
        setZoom(value)
        const moved = zoomOffset(pan, focal, current, value)
        setOffset(image ? clampOffset(moved, image, frame, value) : moved)
    }, [])

    const panBy = useCallback((dx: number, dy: number) => {
        const { natural: image, viewport: frame, zoom: current, offset: pan } = live.current
        if (!image) return
        setOffset(clampOffset({ x: pan.x + dx, y: pan.y + dy }, image, frame, current))
    }, [])

    /**
     * Measure the frame, watch it for resizes, and take the wheel — all keyed to the node's own
     * lifetime rather than this component's. See the note at the top for why that distinction is
     * the whole bug.
     */
    const frameNode = useRef<HTMLDivElement | null>(null)
    const detach = useRef<(() => void) | null>(null)

    const attachFrame = useCallback(
        (node: HTMLDivElement | null) => {
            detach.current?.()
            detach.current = null
            frameNode.current = node
            if (!node) return

            /**
             * Measured from the **ResizeObserver's** box, never `getBoundingClientRect()`.
             *
             * The dialog animates in with `scale-95 → scale-100` over 200ms, and
             * `getBoundingClientRect` returns the *transformed* rectangle — so measuring at attach
             * time reports the frame 5% smaller than it will be, and no later event corrects it:
             * a `transform` changes nothing about layout, so `ResizeObserver` never fires again.
             *
             * The consequences of that 5% were both real and easy to miss. The image is sized in
             * pixels from `viewport`, so it would cover a frame 5% narrower than the one on screen —
             * a hairline of background down two edges — and `cropRect` would take a rectangle
             * slightly different from the one that was shown. Caught by measuring the rendered
             * `<img>` in a browser, not by reading the code.
             *
             * `ResizeObserver` reports the untransformed layout box and fires **once immediately**
             * on `observe`, so it is both the correct number and the initial one. `contentRect`
             * rather than `borderBoxSize` because this element has neither padding nor border and
             * `contentRect` is the field with universal support.
             */
            const observer = new ResizeObserver(entries => {
                const box = entries[0]?.contentRect
                if (box) setViewport({ width: box.width, height: box.height })
            })
            observer.observe(node)

            /*
             * `{ passive: false }`, which is why this is a DOM listener and not an `onWheel` prop:
             * React attaches wheel handlers passively, so `preventDefault` inside one is ignored
             * and a scroll over the picture scrolls the page behind the dialog instead of zooming.
             */
            const onWheel = (event: WheelEvent) => {
                event.preventDefault()
                const rect = node.getBoundingClientRect()
                const focal = {
                    x: event.clientX - (rect.left + rect.width / 2),
                    y: event.clientY - (rect.top + rect.height / 2),
                }
                // Exponential, so one notch is the same *proportion* at every zoom — a linear step
                // crawls when zoomed out and lurches when zoomed in.
                zoomTo(live.current.zoom * Math.exp(-event.deltaY / 400), focal)
            }
            node.addEventListener('wheel', onWheel, { passive: false })

            detach.current = () => {
                observer.disconnect()
                node.removeEventListener('wheel', onWheel)
            }
        },
        [zoomTo],
    )

    /**
     * Pointers currently down, by id — one entry is a drag, two are a pinch.
     *
     * A `Map` rather than a single "is dragging" flag because a second finger landing must
     * *change* the gesture rather than be ignored, and lifting one of two must hand the drag back
     * to the finger that is still down without a jump. Both fall out of keeping the last position
     * per pointer.
     */
    const pointers = useRef(new Map<number, Offset>())
    const pinch = useRef<{ distance: number; zoom: number } | null>(null)

    const pinchDistance = () => {
        const [a, b] = [...pointers.current.values()]
        return Math.hypot(a.x - b.x, a.y - b.y)
    }

    const pinchFocal = (): Offset => {
        const node = frameNode.current
        const [a, b] = [...pointers.current.values()]
        if (!node) return { x: 0, y: 0 }
        const rect = node.getBoundingClientRect()
        return {
            x: (a.x + b.x) / 2 - (rect.left + rect.width / 2),
            y: (a.y + b.y) / 2 - (rect.top + rect.height / 2),
        }
    }

    const confirm = async () => {
        const image = imageRef.current
        if (!image || !natural || busy) return
        setBusy(true)
        try {
            const blob = await renderCrop(
                image,
                cropRect({ natural, viewport, zoom, offset }),
                type,
            )
            onCropped(blob)
            onOpenChange(false)
        } finally {
            setBusy(false)
        }
    }

    const size = natural ? displayedSize(natural, viewport, zoom) : null
    const percent = Math.round(zoom * 100)

    return (
        <Dialog
            open={open}
            onOpenChange={next => {
                // Closing mid-render would drop a blob nobody is waiting for any more, and leave
                // the parent without the picture it is about to be handed.
                if (busy) return
                onOpenChange(next)
            }}
        >
            {/* Wider than the DS dialog's 370: this one has a picture in it, and a crop window
                narrower than a thumb is not a crop window. Still capped to the viewport. */}
            <DialogContent className="w-[440px] sm:w-[560px]">
                <DialogHeader>
                    <DialogTitle>{title}</DialogTitle>
                </DialogHeader>

                <div className="flex flex-col gap-3">
                    {/*
                     * `touch-none` is load-bearing on a phone: without it the browser claims the
                     * drag for scrolling and the picture never moves. `overscroll-contain` stops a
                     * pan that reaches the clamp from becoming a pull-to-refresh.
                     *
                     * `role="application"` with a focus stop — `noNoninteractiveTabindex` is right
                     * that a plain `<div>` has no business in the tab order, and the answer is that
                     * this one is not plain: it is a direct-manipulation surface, and the role is
                     * what makes a screen reader pass the arrow keys through instead of consuming
                     * them. Without the focus stop the control is pointer-only, which is the
                     * failure the rule exists to prevent rather than the one it is reporting.
                     */}
                    <div
                        data-testid="channel-crop-frame"
                        ref={attachFrame}
                        role="application"
                        aria-label={t('profile_crop_frame')}
                        // biome-ignore lint/a11y/noNoninteractiveTabindex: focusable on purpose — see above
                        tabIndex={0}
                        /**
                         * The height cap is written as a **max-width**, and that is not a
                         * stylistic choice.
                         *
                         * `aspect-ratio` yields to explicit sizing: `width: 100%` plus a
                         * `max-height` gives an element that is shorter than its ratio demands and
                         * still full width — i.e. the frame silently stops being 1:1 on a short
                         * window. Since the crop rectangle is computed from the *measured* frame,
                         * a square avatar would then be cropped to a letterbox and nothing on
                         * screen would say so.
                         *
                         * Capping the width instead shrinks the box along its diagonal, so the
                         * ratio holds at every viewport height. 52vh leaves room for the title,
                         * the zoom row and the two buttons on a 600px-tall laptop window.
                         */
                        style={{ aspectRatio: String(aspect), maxWidth: `calc(52vh * ${aspect})` }}
                        className={cn(
                            'relative mx-auto w-full touch-none select-none overflow-hidden overscroll-contain',
                            'rounded-lg bg-(--background-segment)',
                            dragging ? 'cursor-grabbing' : 'cursor-grab',
                            'focus-visible:outline focus-visible:outline-2 focus-visible:outline-(--input-border-focus)',
                        )}
                        onPointerDown={event => {
                            pointers.current.set(event.pointerId, {
                                x: event.clientX,
                                y: event.clientY,
                            })
                            event.currentTarget.setPointerCapture(event.pointerId)
                            if (pointers.current.size === 2) {
                                pinch.current = { distance: pinchDistance(), zoom }
                            }
                            setDragging(true)
                        }}
                        onPointerMove={event => {
                            const previous = pointers.current.get(event.pointerId)
                            if (!previous) return
                            const current = { x: event.clientX, y: event.clientY }
                            pointers.current.set(event.pointerId, current)

                            if (pointers.current.size >= 2) {
                                const start = pinch.current
                                if (!start || start.distance <= 0) return
                                zoomTo(
                                    (start.zoom * pinchDistance()) / start.distance,
                                    pinchFocal(),
                                )
                                return
                            }

                            panBy(current.x - previous.x, current.y - previous.y)
                        }}
                        onPointerUp={event => {
                            pointers.current.delete(event.pointerId)
                            event.currentTarget.releasePointerCapture(event.pointerId)
                            // A pinch that loses a finger becomes a drag from wherever the
                            // remaining one is — the surviving entry already holds that position.
                            if (pointers.current.size < 2) pinch.current = null
                            if (pointers.current.size === 0) setDragging(false)
                        }}
                        onPointerCancel={event => {
                            pointers.current.delete(event.pointerId)
                            if (pointers.current.size < 2) pinch.current = null
                            if (pointers.current.size === 0) setDragging(false)
                        }}
                        onKeyDown={event => {
                            const step = event.shiftKey ? 64 : 16
                            const pans: Record<string, [number, number]> = {
                                ArrowLeft: [-step, 0],
                                ArrowRight: [step, 0],
                                ArrowUp: [0, -step],
                                ArrowDown: [0, step],
                            }
                            const move = pans[event.key]
                            if (move) {
                                event.preventDefault()
                                panBy(move[0], move[1])
                                return
                            }
                            // `=` as well as `+`, because `+` needs Shift on most layouts and the
                            // unshifted key is the one people press.
                            if (event.key === '+' || event.key === '=') {
                                event.preventDefault()
                                zoomTo(zoom + 0.2)
                            } else if (event.key === '-' || event.key === '_') {
                                event.preventDefault()
                                zoomTo(zoom - 0.2)
                            }
                        }}
                    >
                        {src && (
                            /*
                             * A plain `<img>`, not `next/image`: the source is a `blob:` URL for a
                             * file that exists only in this tab, so there is nothing to fetch,
                             * cache or resize — and the optimiser would refuse the host outright.
                             * `crossOrigin` keeps the canvas untainted if this is ever pointed at a
                             * remote URL.
                             */
                            // biome-ignore lint/performance/noImgElement: blob: source, see above
                            <img
                                ref={imageRef}
                                src={src}
                                alt=""
                                crossOrigin="anonymous"
                                draggable={false}
                                onLoad={event => {
                                    const element = event.currentTarget
                                    setNatural({
                                        width: element.naturalWidth,
                                        height: element.naturalHeight,
                                    })
                                }}
                                style={
                                    size
                                        ? {
                                              width: `${size.width}px`,
                                              height: `${size.height}px`,
                                              transform: `translate(calc(-50% + ${offset.x}px), calc(-50% + ${offset.y}px))`,
                                          }
                                        : { opacity: 0 }
                                }
                                className="pointer-events-none absolute start-1/2 top-1/2 max-w-none"
                            />
                        )}

                        {/*
                         * The mask, and it is the piece that makes the preview honest. An avatar is
                         * rendered as a circle everywhere in this app, so showing a square preview
                         * promises corners that will not survive. What is *cropped* is still the
                         * square — the circle is how it will be displayed, not what is stored.
                         *
                         * Drawn with a huge spread `box-shadow` rather than an SVG mask or four
                         * dimming panels: one element, no seams where panels meet, and it clips to
                         * the frame's own `overflow-hidden`.
                         */}
                        {natural && shape === 'round' && (
                            <div
                                aria-hidden
                                className="pointer-events-none absolute inset-0 rounded-full shadow-[0_0_0_9999px_rgba(0,0,0,0.55)]"
                            />
                        )}

                        {/*
                         * Thirds guides, only while a gesture is in progress. A permanent grid is
                         * clutter over a photograph; one that appears under the finger is an aid.
                         */}
                        {natural && dragging && (
                            <div aria-hidden className="pointer-events-none absolute inset-0">
                                <div className="absolute inset-x-0 top-1/3 h-px bg-white/40" />
                                <div className="absolute inset-x-0 top-2/3 h-px bg-white/40" />
                                <div className="absolute inset-y-0 start-1/3 w-px bg-white/40" />
                                <div className="absolute inset-y-0 start-2/3 w-px bg-white/40" />
                            </div>
                        )}

                        {/* The picture is decoded off the main thread, so on a large file the
                            frame is empty for a beat. Saying "working" beats an empty grey box —
                            which is exactly what the measuring bug used to look like. */}
                        {src && !natural && (
                            <div className="absolute inset-0 flex items-center justify-center">
                                <Loader label={t('common_loading')} />
                            </div>
                        )}
                    </div>

                    {/* ── zoom ──────────────────────────────────────────────────────────────── */}
                    <div className="flex items-center gap-2">
                        <ZoomButton
                            testId="channel-crop-zoom-out"
                            icon="search-minus"
                            label={t('profile_crop_zoom_out')}
                            disabled={!natural || zoom <= MIN_ZOOM}
                            onClick={() => zoomTo(zoom - 0.2)}
                        />
                        {/*
                         * The DS ships no Slider — `components.css` truncates before it — so this
                         * is the native range input, tinted with `accent-color`. A hand-drawn track
                         * would be an invented component; this one is keyboard- and
                         * screen-reader-complete for free.
                         */}
                        <input
                            data-testid="channel-crop-zoom"
                            type="range"
                            min={MIN_ZOOM}
                            max={MAX_ZOOM}
                            step={0.01}
                            value={zoom}
                            disabled={!natural}
                            aria-label={t('profile_crop_zoom')}
                            aria-valuetext={`${percent}%`}
                            onChange={event => zoomTo(Number(event.target.value))}
                            className="h-1 min-w-0 flex-auto cursor-pointer accent-(--button-primary-bg) disabled:cursor-not-allowed disabled:opacity-50"
                        />
                        <ZoomButton
                            testId="channel-crop-zoom-in"
                            icon="search-plus"
                            label={t('profile_crop_zoom_in')}
                            disabled={!natural || zoom >= MAX_ZOOM}
                            onClick={() => zoomTo(zoom + 0.2)}
                        />
                        {/* Tabular figures, so the number does not jitter the row as it counts. */}
                        <span className="type-caption-meta w-10 flex-none text-end font-[tabular-nums] text-(--text-subtitle)">
                            {percent}%
                        </span>
                    </div>

                    <div className="flex items-center justify-between gap-2">
                        <p className="type-caption-meta text-(--text-subtitle)">
                            {t('profile_crop_hint')}
                        </p>
                        <Button
                            data-testid="channel-crop-reset"
                            type="button"
                            variant="ghost"
                            size="small"
                            disabled={
                                !natural || (zoom === MIN_ZOOM && offset.x === 0 && offset.y === 0)
                            }
                            onClick={() => {
                                setZoom(MIN_ZOOM)
                                setOffset({ x: 0, y: 0 })
                            }}
                        >
                            <Icon name="arrow-rotate-left" size={16} />
                            {t('profile_crop_reset')}
                        </Button>
                    </div>
                </div>

                <DialogFooter layout="side-by-side">
                    <Button
                        data-testid="channel-crop-cancel"
                        type="button"
                        variant="secondary"
                        size="large"
                        disabled={busy}
                        onClick={() => onOpenChange(false)}
                    >
                        {t('common_close')}
                    </Button>
                    <Button
                        data-testid="channel-crop-confirm"
                        type="button"
                        variant="primary"
                        size="large"
                        onClick={confirm}
                        disabled={!natural || busy}
                    >
                        {busy && <Loader />}
                        {t('profile_crop_apply')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}

/**
 * One of the two zoom steppers.
 *
 * A separate component only so the two cannot drift — they are the same control twice, and the
 * one thing that must stay identical between them is that the icon is decorative and the name
 * lives on the button.
 */
function ZoomButton({
    icon,
    label,
    disabled,
    onClick,
    testId,
}: {
    icon: 'search-minus' | 'search-plus'
    label: string
    disabled: boolean
    onClick: () => void
    /** Passed, not spread — a closed prop list would drop a `data-testid` silently. */
    testId?: string
}) {
    return (
        <button
            type="button"
            data-testid={testId}
            disabled={disabled}
            onClick={onClick}
            title={label}
            className={cn(
                'flex size-8 flex-none items-center justify-center rounded-md',
                'text-(--icon-secondary) transition-colors',
                'hover:bg-(--background-segment) hover:text-(--text-title)',
                'disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent',
            )}
        >
            <Icon name={icon} size={20} aria-hidden />
            <span className="sr-only">{label}</span>
        </button>
    )
}
