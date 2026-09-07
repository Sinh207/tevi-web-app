'use client'

import { useCallback, useRef, useState } from 'react'
import { canStartDragFrom } from '../lib/drag-origin'
import { useMiniAppStore } from '../store/mini-app-store'
import { viewportNow } from './use-viewport'

/** Pointer travel, in px, before a press becomes a drag. Below it, the press is still a click. */
const DRAG_THRESHOLD = 4

/**
 * Drag the window by its tab strip.
 *
 * Hand-rolled rather than a library, for the same reason legacy's is: the strip is also a row of
 * buttons, and the interaction has to be "a press that *travels* is a drag, a press that does not
 * is a click on whatever was under it". A drag library takes the pointer down and the click is
 * gone.
 *
 * ## Pointer events, and capture
 *
 * `setPointerCapture` is what fixes the bug every hand-rolled drag has: the pointer leaves the
 * element — over the frame, over another window, off the viewport — and the moves stop arriving.
 * With capture, this element receives every move and the release until it lets go. It also gets
 * touch and pen for free, though on a compact viewport the window is full-screen and this hook is
 * never enabled.
 *
 * ## The position is read from the store at press time, not tracked
 *
 * `moveTo` clamps against the viewport, so the rect it produces is not always `start + delta`. If
 * this hook accumulated its own position it would drift out of agreement with the store the first
 * time the window hit an edge, and the window would appear to slide out from under the pointer.
 */
export function useWindowDrag({ enabled }: { enabled: boolean }) {
    const [isDragging, setIsDragging] = useState(false)
    const moveTo = useMiniAppStore(state => state.moveTo)
    const drag = useRef<{
        pointerId: number
        startX: number
        startY: number
        originX: number
        originY: number
    } | null>(null)
    const frame = useRef<number | null>(null)

    const onPointerDown = useCallback(
        (event: React.PointerEvent<HTMLElement>) => {
            if (!enabled || event.button !== 0) return
            /*
             * Where a drag may start from. `canStartDragFrom` has the whole story, and it is worth
             * reading before touching this: the interesting half is that React propagates events
             * out of a **portal** along the React tree, so without it a click on the tab's ⋯ menu —
             * which lives in `document.body` — started a drag here and had its `click` swallowed by
             * the pointer capture below.
             */
            if (!canStartDragFrom(event.target, event.currentTarget)) return

            const rect = useMiniAppStore.getState().rect
            if (!rect) return

            drag.current = {
                pointerId: event.pointerId,
                startX: event.clientX,
                startY: event.clientY,
                originX: rect.x,
                originY: rect.y,
            }
            event.currentTarget.setPointerCapture(event.pointerId)
        },
        [enabled],
    )

    const onPointerMove = useCallback(
        (event: React.PointerEvent<HTMLElement>) => {
            const state = drag.current
            if (!state || state.pointerId !== event.pointerId) return

            const dx = event.clientX - state.startX
            const dy = event.clientY - state.startY
            if (!isDragging) {
                if (Math.abs(dx) < DRAG_THRESHOLD && Math.abs(dy) < DRAG_THRESHOLD) return
                setIsDragging(true)
            }

            /*
             * One store write per animation frame. A pointer reports far more often than the screen
             * repaints, and every write here re-renders the window and its resize handles.
             */
            if (frame.current !== null) cancelAnimationFrame(frame.current)
            frame.current = requestAnimationFrame(() => {
                frame.current = null
                moveTo({ x: state.originX + dx, y: state.originY + dy }, viewportNow())
            })
        },
        [isDragging, moveTo],
    )

    const endDrag = useCallback((event: React.PointerEvent<HTMLElement>) => {
        if (drag.current?.pointerId !== event.pointerId) return
        drag.current = null
        if (frame.current !== null) {
            cancelAnimationFrame(frame.current)
            frame.current = null
        }
        setIsDragging(false)
    }, [])

    return {
        isDragging,
        /** Spread onto the drag surface. Includes `onLostPointerCapture` — a capture can be taken away. */
        dragHandlers: enabled
            ? {
                  onPointerDown,
                  onPointerMove,
                  onPointerUp: endDrag,
                  onPointerCancel: endDrag,
                  onLostPointerCapture: endDrag,
              }
            : {},
    }
}
