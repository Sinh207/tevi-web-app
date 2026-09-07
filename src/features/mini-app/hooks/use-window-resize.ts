'use client'

import { useCallback, useRef, useState } from 'react'
import type { Rect, ResizeDirection } from '../lib/window-geometry'
import { useMiniAppStore } from '../store/mini-app-store'
import { viewportNow } from './use-viewport'

/**
 * Resize the window from its eight edges and corners.
 *
 * The arithmetic — which axis drives, how the ratio is kept, how the origin moves when the north
 * or west side is dragged — is `lib/window-geometry.ts`'s `resizeRect`, and it is pure and tested
 * there. This hook is only the gesture: capture the pointer, remember the rect the drag started
 * from, and feed deltas in.
 *
 * **The start rect is captured once**, at press. Reading it per move would compound the clamping
 * `resizeRect` applies, and the window would accelerate away from the pointer as soon as it met a
 * minimum or the viewport edge.
 */
export function useWindowResize({ enabled }: { enabled: boolean }) {
    const [isResizing, setIsResizing] = useState(false)
    const resizeFrom = useMiniAppStore(state => state.resizeFrom)
    const gesture = useRef<{
        pointerId: number
        direction: ResizeDirection
        startX: number
        startY: number
        rect: Rect
    } | null>(null)
    const frame = useRef<number | null>(null)

    const startResize = useCallback(
        (event: React.PointerEvent<HTMLElement>, direction: ResizeDirection) => {
            if (!enabled || event.button !== 0) return
            const rect = useMiniAppStore.getState().rect
            if (!rect) return
            /*
             * The handles sit inside the window and overlap the tab strip's drag surface at the top
             * edge. Stopping propagation is what keeps a resize from also being a move.
             */
            event.preventDefault()
            event.stopPropagation()
            gesture.current = {
                pointerId: event.pointerId,
                direction,
                startX: event.clientX,
                startY: event.clientY,
                rect,
            }
            event.currentTarget.setPointerCapture(event.pointerId)
            setIsResizing(true)
        },
        [enabled],
    )

    const onPointerMove = useCallback(
        (event: React.PointerEvent<HTMLElement>) => {
            const state = gesture.current
            if (!state || state.pointerId !== event.pointerId) return
            const delta = { x: event.clientX - state.startX, y: event.clientY - state.startY }

            if (frame.current !== null) cancelAnimationFrame(frame.current)
            frame.current = requestAnimationFrame(() => {
                frame.current = null
                resizeFrom({
                    direction: state.direction,
                    start: state.rect,
                    delta,
                    viewport: viewportNow(),
                })
            })
        },
        [resizeFrom],
    )

    const endResize = useCallback((event: React.PointerEvent<HTMLElement>) => {
        if (gesture.current?.pointerId !== event.pointerId) return
        gesture.current = null
        if (frame.current !== null) {
            cancelAnimationFrame(frame.current)
            frame.current = null
        }
        setIsResizing(false)
    }, [])

    return {
        isResizing,
        startResize,
        resizeHandlers: {
            onPointerMove,
            onPointerUp: endResize,
            onPointerCancel: endResize,
            onLostPointerCapture: endResize,
        },
    }
}
