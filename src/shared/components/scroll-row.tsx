'use client'

import { cn } from '@shared/lib/utils'
import { Icon } from '@shared/ui/icon'
import { type ReactNode, type RefObject, useCallback, useEffect, useRef, useState } from 'react'

/**
 * A row of small things you scroll sideways — chips, tiles — with the platform doing the scrolling.
 *
 * `docs/DESIGN_SYSTEM.md` §10 is the reason this is native `overflow-x-auto` + `snap-x` and not
 * Embla: a row keeps momentum, `overscroll-behavior`, and the browser scrolling a focused child into
 * view, all of which a transform track gives up.
 *
 * ## Lifted from `search-following-strip.tsx`, and the other three copies are not yet on it
 *
 * `features/search`, `features/premium` (`gift-following-strip.tsx`) and `features/share`
 * (`ChannelRow`) each carry a private copy of this measure-and-arrows logic. The collections row
 * would have been a fourth, so the search strip's version — the one with the RTL fix written down —
 * moved here instead. Migrating the three is a separate change: each has geometry of its own (the
 * share sheet's mask, the tiles' arrow height) that has to be checked by rendering, not by diff.
 *
 * `children` are the items, each an `<li>`: the track is a `<ul>`, so a screen reader announces how
 * many there are. Give each one `snap-start` to have a drag settle on it.
 */
export function ScrollRow({
    children,
    count,
    label,
    arrowTop = '50%',
    className,
    trackClassName,
}: {
    children: ReactNode
    /** How many items — a replaced list moves `scrollWidth` without resizing the track. */
    count: number
    /** The list's accessible name. */
    label?: string
    /** Where the arrows' centre sits, from the row's top. Half the item height is the usual value. */
    arrowTop?: string
    className?: string
    trackClassName?: string
}) {
    const trackRef = useRef<HTMLUListElement>(null)
    const { canStart, canEnd, scrollBy } = useRowScroll(trackRef, count)

    return (
        <div className={cn('relative min-w-0', className)}>
            <ul
                ref={trackRef}
                aria-label={label}
                className={cn(
                    'flex list-none snap-x items-center overflow-x-auto overscroll-x-contain',
                    // The scrollbar is chrome the design does not draw; the arrows are the cue.
                    '[-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
                    trackClassName,
                )}
            >
                {children}
            </ul>
            <RowArrow edge="start" top={arrowTop} shown={canStart} onPress={() => scrollBy(-1)} />
            <RowArrow edge="end" top={arrowTop} shown={canEnd} onPress={() => scrollBy(1)} />
        </div>
    )
}

/**
 * How far the row can still travel each way, read from the DOM — `search-following-strip.tsx` has
 * the long form. Two things worth keeping in view here:
 *
 * - **`Math.abs(scrollLeft)`**, because its sign in an RTL container differs by engine; a distance
 *   from each end is direction-agnostic.
 * - **`scrollBy({ left })` is physical**, so the one `dir` branch is there: under `ar` a positive
 *   `left` travels toward the content's start.
 */
function useRowScroll(ref: RefObject<HTMLUListElement | null>, count: number) {
    const [canStart, setCanStart] = useState(false)
    const [canEnd, setCanEnd] = useState(false)

    const measure = useCallback(() => {
        const node = ref.current
        if (!node) return
        const travelled = Math.abs(node.scrollLeft)
        const total = node.scrollWidth - node.clientWidth
        // 1px of slack for fractional layouts, or the end arrow never goes away.
        setCanStart(travelled > 1)
        setCanEnd(total - travelled > 1)
    }, [ref])

    // biome-ignore lint/correctness/useExhaustiveDependencies: `count` re-measures a row the ResizeObserver cannot see change
    useEffect(() => {
        const node = ref.current
        if (!node) return
        measure()
        node.addEventListener('scroll', measure, { passive: true })
        const observer = new ResizeObserver(measure)
        observer.observe(node)
        return () => {
            node.removeEventListener('scroll', measure)
            observer.disconnect()
        }
    }, [ref, measure, count])

    const scrollBy = useCallback(
        (direction: -1 | 1) => {
            const node = ref.current
            if (!node) return
            const inline = getComputedStyle(node).direction === 'rtl' ? -direction : direction
            // 80%, so an item of overlap says the row moved rather than replaced itself.
            node.scrollBy({ left: inline * node.clientWidth * 0.8, behavior: 'smooth' })
        },
        [ref],
    )

    return { canStart, canEnd, scrollBy }
}

/**
 * One overlaid arrow disc. Removed rather than dimmed at its end, shown only to a fine pointer (a
 * finger already has the drag), and `aria-hidden` because the scrollport is keyboard-reachable on
 * its own — the arrows duplicate what Tab already does.
 */
function RowArrow({
    edge,
    top,
    shown,
    onPress,
}: {
    edge: 'start' | 'end'
    top: string
    shown: boolean
    onPress: () => void
}) {
    if (!shown) return null

    return (
        <button
            type="button"
            aria-hidden="true"
            tabIndex={-1}
            onClick={onPress}
            style={{ top }}
            className={cn(
                'absolute hidden size-8 -translate-y-1/2 items-center justify-center',
                'pointer-fine:flex',
                'rounded-(--radius-fill) bg-(--background-elevated) text-(--icon-default) shadow-md',
                'cursor-pointer transition-colors hover:bg-(--background-segment)',
                edge === 'start' ? 'start-1' : 'end-1',
            )}
        >
            <Icon
                name={edge === 'start' ? 'angle-left' : 'angle-right'}
                size={20}
                className="rtl:-scale-x-100"
            />
        </button>
    )
}
