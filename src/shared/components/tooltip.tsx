'use client'

import { Tooltip as BaseTooltip } from '@base-ui/react/tooltip'
import { cn } from '@shared/lib/utils'
import type { ReactElement, ReactNode } from 'react'

/**
 * A short label shown beside a control on hover or keyboard focus — for icon-only chrome whose
 * glyphs a desktop reader should not have to guess (the rail).
 *
 * The DS draws no tooltip, so this is app-authored and lives in `shared/components`, not
 * `shared/ui`. Base UI's primitive underneath, which brings the parts that are easy to get wrong:
 * the open delay, keyboard focus opening it, Escape closing it, and touch never opening it (a press
 * on a phone is a press, not a hover).
 *
 * ## Paint and motion
 *
 * **Inverted** — `--text-title` ground with `--background-surface` ink — so it reads as a label
 * floating over the page in both themes rather than one more surface. 12/600, 6px radius, a soft
 * shadow. It scales in from the side it is attached to (`--transform-origin`, which Base UI sets to
 * the anchor's edge) while it fades: 150ms in, quicker out. Under reduced motion it only fades.
 *
 * ## Grouping
 *
 * Wrap a cluster of tooltips in `TooltipProvider`: after the first one opens, moving to its
 * neighbour opens the next at once instead of waiting the delay again — the behaviour that makes a
 * rail of icons feel scannable rather than sticky.
 *
 * `children` must be a single element that forwards its props and ref (a `Link`, a DS item, a
 * button) — it becomes the trigger; nothing is wrapped around it.
 */
export function Tooltip({
    label,
    side = 'inline-end',
    children,
}: {
    label: ReactNode
    side?: 'top' | 'bottom' | 'inline-start' | 'inline-end'
    children: ReactElement
}) {
    return (
        <BaseTooltip.Root>
            <BaseTooltip.Trigger render={children} />
            <BaseTooltip.Portal>
                <BaseTooltip.Positioner side={side} sideOffset={10} className="z-60">
                    <BaseTooltip.Popup
                        className={cn(
                            'type-caption-label-strong rounded-md bg-(--text-title) px-2.5 py-1.5 whitespace-nowrap text-(--background-surface) shadow-lg',
                            'origin-(--transform-origin) transition-[opacity,scale] duration-150 ease-out',
                            'data-[starting-style]:scale-90 data-[starting-style]:opacity-0',
                            'data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[ending-style]:duration-100',
                            'motion-reduce:transition-[opacity] motion-reduce:data-[starting-style]:scale-100',
                        )}
                    >
                        {label}
                    </BaseTooltip.Popup>
                </BaseTooltip.Positioner>
            </BaseTooltip.Portal>
        </BaseTooltip.Root>
    )
}

/** Shares one open delay across a cluster — see `Tooltip`'s note on grouping. */
export function TooltipProvider({
    children,
    delay = 300,
}: {
    children: ReactNode
    delay?: number
}) {
    return <BaseTooltip.Provider delay={delay}>{children}</BaseTooltip.Provider>
}
