/**
 * The floating window's geometry — pure arithmetic over a viewport.
 *
 * Every number a reader can drag is decided here, which is what lets "the window can never be
 * dragged off screen" and "resizing keeps the phone shape" be tests instead of hopes. Nothing in
 * this file reads `window`: the viewport is always passed in, so it runs in node and it cannot
 * disagree with itself between a server render and a client one.
 */

export interface Rect {
    x: number
    y: number
    width: number
    height: number
}

export interface Viewport {
    width: number
    height: number
}

/**
 * A mini app is drawn for a phone, so the window is a phone: **height leads and width follows**.
 * 420 × 730 is legacy's ratio and is close to a 9:19.5 handset with the tab strip added on top.
 */
export const WINDOW_ASPECT_RATIO = 420 / 730

export const MIN_WIDTH = 300
export const MIN_HEIGHT = 420

/** Breathing room above and below the default window, so it reads as floating. */
export const DEFAULT_MARGIN = 32

/** The eight grab zones, as the resize handler names them. */
export type ResizeDirection = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw'

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max)

/**
 * Where the window opens: as tall as the viewport allows, width from the aspect ratio, centred.
 *
 * Both dimensions are clamped **below** by the minimums and above by the viewport, in that order,
 * which is why a viewport smaller than the minimum yields a window larger than it rather than a
 * negative size. That case is real — a short landscape phone — and it is handled by the caller
 * going full-screen instead (`isCompactViewport`), not by pretending a 200px-tall window works.
 */
export function defaultRect(viewport: Viewport): Rect {
    const height = clamp(
        viewport.height - DEFAULT_MARGIN,
        MIN_HEIGHT,
        Math.max(viewport.height, MIN_HEIGHT),
    )
    const width = clamp(
        Math.round(height * WINDOW_ASPECT_RATIO),
        MIN_WIDTH,
        Math.max(viewport.width - DEFAULT_MARGIN, MIN_WIDTH),
    )
    return {
        width,
        height,
        x: Math.max(0, Math.round((viewport.width - width) / 2)),
        y: Math.max(0, Math.round((viewport.height - height) / 2)),
    }
}

/**
 * Keep a rect fully on screen.
 *
 * `Math.max(0, …)` on the lower bound matters: with a window wider than the viewport,
 * `viewport.width - rect.width` is negative, and clamping to it would push the window off the
 * left edge — which is the one direction a reader cannot drag it back from, because the tab strip
 * they drag by would be the part that is gone.
 */
export function clampPosition(rect: Rect, viewport: Viewport): Rect {
    return {
        ...rect,
        x: clamp(rect.x, 0, Math.max(0, viewport.width - rect.width)),
        y: clamp(rect.y, 0, Math.max(0, viewport.height - rect.height)),
    }
}

/** Fit a rect inside the viewport, size first, then position. */
export function clampRect(rect: Rect, viewport: Viewport): Rect {
    const width = clamp(rect.width, MIN_WIDTH, Math.max(viewport.width, MIN_WIDTH))
    const height = clamp(rect.height, MIN_HEIGHT, Math.max(viewport.height, MIN_HEIGHT))
    return clampPosition({ ...rect, width, height }, viewport)
}

/**
 * Resize from one of the eight handles, **preserving the aspect ratio**.
 *
 * The dragged axis drives and the other follows, so a corner drag does not stretch a portrait app
 * into a letterbox. Which axis drives is decided by the handle: a horizontal component (`e`/`w`,
 * including corners) drives from width, a pure `n`/`s` edge drives from height.
 *
 * Dragging the `n` or `w` side moves the opposite edge, so the origin has to move by exactly what
 * the size did — `start.x + (start.width - width)`. Computing it from the pointer delta instead
 * is the classic drift: the ratio correction changes the size by more than the pointer moved, and
 * the window creeps.
 */
export function resizeRect({
    direction,
    start,
    delta,
    viewport,
}: {
    direction: ResizeDirection
    start: Rect
    delta: { x: number; y: number }
    viewport: Viewport
}): Rect {
    const horizontal = direction.includes('e') || direction.includes('w')

    let width: number
    let height: number
    if (horizontal) {
        width = direction.includes('e') ? start.width + delta.x : start.width - delta.x
        height = Math.round(width / WINDOW_ASPECT_RATIO)
    } else {
        height = direction.includes('s') ? start.height + delta.y : start.height - delta.y
        width = Math.round(height * WINDOW_ASPECT_RATIO)
    }

    // Re-clamp on both axes while keeping the ratio. Order matters: a window against the bottom
    // edge must lose width, not shape.
    if (width < MIN_WIDTH) {
        width = MIN_WIDTH
        height = Math.round(width / WINDOW_ASPECT_RATIO)
    }
    if (height < MIN_HEIGHT) {
        height = MIN_HEIGHT
        width = Math.round(height * WINDOW_ASPECT_RATIO)
    }
    if (width > viewport.width) {
        width = viewport.width
        height = Math.round(width / WINDOW_ASPECT_RATIO)
    }
    if (height > viewport.height) {
        height = viewport.height
        width = Math.round(height * WINDOW_ASPECT_RATIO)
    }

    const x = direction.includes('w') ? start.x + (start.width - width) : start.x
    const y = direction.includes('n') ? start.y + (start.height - height) : start.y

    return clampPosition({ x, y, width, height }, viewport)
}

/**
 * Below this the window is not a window: it is the screen.
 *
 * `900` is the design system's `md` breakpoint (`globals.css`), so the player switches to
 * full-screen at the same width the app switches to its mobile shell. Drag and resize are
 * meaningless there and are not merely hidden — the handlers are never attached.
 */
export const COMPACT_VIEWPORT_WIDTH = 900

export function isCompactViewport(viewport: Viewport): boolean {
    return viewport.width < COMPACT_VIEWPORT_WIDTH
}
