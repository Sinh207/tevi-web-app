'use client'

import type { CSSProperties } from 'react'
import type { ResizeDirection } from '../lib/window-geometry'

/**
 * Eight invisible grab zones around the window: four edges and four corners.
 *
 * Sized generously (8px edges, 14px corners) and pulled 4px **outside** the frame, because a
 * hairline border is not something a pointer can reliably hit — and the window's own overflow is
 * hidden, so the outer half of each zone is the part that is actually easy to grab.
 *
 * Corners come after edges in the DOM and overlap them, so a corner wins the press: a diagonal
 * drag is the one people reach for, and an edge stealing it is the difference between resizing and
 * stretching.
 *
 * ## ⚠ Positioned **physically**, and that is not an RTL oversight
 *
 * Everything else in this app positions with logical properties (`start`/`end`), and this is the
 * one place that must not. A resize direction is a **physical** edge: `resizeRect` computes
 * `w` as "the left edge moved, so `x` moves and the width shrinks", against an `x` that is a
 * `translate()` offset — and `translate` is physical in both directions.
 *
 * So with `-start-1`, the `w` handle renders on the **right** in an RTL locale while its arithmetic
 * still moves the left edge: dragging it inward would grow the window instead of shrinking it, and
 * the window would walk sideways. Logical classes are correct for content and wrong for geometry.
 *
 * Inline styles rather than the physical Tailwind position utilities, so `pnpm lint:rtl` — which
 * reads class names and cannot know that this file means them — does not need an exception, and so
 * the reason travels with the code instead of living in that script.
 */
const HANDLE = 8
const CORNER = 14
const OUTSET = -4

/**
 * Exported for `resize-handles.test.ts`, which pins the one thing about this table that has no other
 * guard: that every handle is anchored on the **physical** edge its direction moves. Logical
 * properties here are an RTL bug that renders perfectly and resizes the wrong way, which no type and
 * no lint can catch.
 */
export const RESIZE_HANDLES: {
    direction: ResizeDirection
    style: CSSProperties
    cursor: string
}[] = [
    {
        direction: 'n',
        style: { top: OUTSET, left: CORNER, right: CORNER, height: HANDLE },
        cursor: 'ns-resize',
    },
    {
        direction: 's',
        style: { bottom: OUTSET, left: CORNER, right: CORNER, height: HANDLE },
        cursor: 'ns-resize',
    },
    {
        direction: 'w',
        style: { left: OUTSET, top: CORNER, bottom: CORNER, width: HANDLE },
        cursor: 'ew-resize',
    },
    {
        direction: 'e',
        style: { right: OUTSET, top: CORNER, bottom: CORNER, width: HANDLE },
        cursor: 'ew-resize',
    },
    {
        direction: 'nw',
        style: { top: OUTSET, left: OUTSET, width: CORNER, height: CORNER },
        cursor: 'nwse-resize',
    },
    {
        direction: 'ne',
        style: { top: OUTSET, right: OUTSET, width: CORNER, height: CORNER },
        cursor: 'nesw-resize',
    },
    {
        direction: 'sw',
        style: { bottom: OUTSET, left: OUTSET, width: CORNER, height: CORNER },
        cursor: 'nesw-resize',
    },
    {
        direction: 'se',
        style: { bottom: OUTSET, right: OUTSET, width: CORNER, height: CORNER },
        cursor: 'nwse-resize',
    },
]

export function ResizeHandles({
    onStart,
    handlers,
}: {
    onStart: (event: React.PointerEvent<HTMLElement>, direction: ResizeDirection) => void
    /** The move/up/cancel set from `useWindowResize`, spread onto every zone. */
    handlers: React.HTMLAttributes<HTMLElement>
}) {
    return (
        <>
            {RESIZE_HANDLES.map(({ direction, style, cursor }) => (
                <div
                    key={direction}
                    /*
                     * `aria-hidden`, and deliberately not keyboard-reachable. A resize handle is a
                     * pointer affordance with no keyboard equivalent worth inventing; the window's
                     * two useful sizes — floating and full-screen — are the maximise button, which
                     * *is* reachable. Eight focus stops that do nothing on a keyboard would be
                     * worse for the readers this is meant to help.
                     */
                    aria-hidden
                    /*
                     * `touchAction: 'none'` for the reason the tab strip has it: these are pointer
                     * capture zones, and on a touch device wide enough to show a floating window a
                     * drag from one would otherwise pan the page.
                     */
                    style={{
                        position: 'absolute',
                        zIndex: 20,
                        touchAction: 'none',
                        cursor,
                        ...style,
                    }}
                    onPointerDown={event => onStart(event, direction)}
                    {...handlers}
                />
            ))}
        </>
    )
}
