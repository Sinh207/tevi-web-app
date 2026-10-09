'use client'

import { useEffect, useRef, useState } from 'react'

/** Ease-out cubic — fast at first, settling into the figure. */
const easeOut = (t: number) => 1 - (1 - t) ** 3

/**
 * `target`, approached from wherever the last one left off over `durationMs` — so stepping from
 * Tier 1 to Tier 2 rolls the estimate up from $42 to $85 rather than swapping the text.
 *
 * The **first** value is shown as-is: counting up from zero on arrival would print figures the
 * reader never had, and a zero is a claim about money. Under `prefers-reduced-motion` every change
 * is immediate. `null` passes straight through, so an unknown figure is never animated into.
 */
export function useCountUp(target: number | null, durationMs = 500): number | null {
    const [value, setValue] = useState(target)
    const shown = useRef(target)

    useEffect(() => {
        const from = shown.current
        const reduce =
            typeof window !== 'undefined' &&
            window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
        if (target === null || from === null || from === target || reduce) {
            shown.current = target
            setValue(target)
            return
        }
        let frame = 0
        const start = performance.now()
        const step = (now: number) => {
            const progress = Math.min(1, (now - start) / durationMs)
            const next = from + (target - from) * easeOut(progress)
            shown.current = next
            setValue(next)
            if (progress < 1) frame = requestAnimationFrame(step)
        }
        frame = requestAnimationFrame(step)
        return () => cancelAnimationFrame(frame)
    }, [target, durationMs])

    return value
}
