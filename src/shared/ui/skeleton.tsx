import { cn } from '@shared/lib/utils'
import type { ComponentPropsWithoutRef, CSSProperties } from 'react'

/**
 * Loading placeholders.
 *
 * **The design system ships no Skeleton component.** `.tevi-loader` is a three-dot walk and
 * `.tevi-spinner` is an eight-bar ring — both are "working…" indicators, neither is a content
 * placeholder. So rather than invent a look, this reuses the one bar-shaped placeholder the DS
 * does draw: `AI/Skeleton` (Figma 92:19340), scoped in Figma to the AI message bubble. Its
 * tokens, verbatim: 12px tall, radius 4, `--opacity-labels-55` at opacity .4, breathing to .15
 * over 1600ms, 160ms of stagger per sibling.
 *
 * That is the whole vocabulary on purpose. No shimmer gradient, no `animate-pulse` — both would
 * be inventions, and `docs/DESIGN_SYSTEM.md` is explicit that a missing component gets reported,
 * not approximated. If design ships a real Skeleton, this file changes and nothing else does.
 *
 * ## Making a skeleton that actually matches
 *
 * `docs/DEFINITION_OF_DONE.md` §1 asks for a skeleton matching the final layout's *shape*, and
 * the way that requirement is failed is by giving each bar the height of its text. A 16px line
 * of `type-body-*` occupies 24px once its 1.5 line-height is counted, so a 12px bar in a 12px
 * row collapses the layout and everything jumps on load. Reserve the **row** at its real height
 * and put the bar inside it:
 *
 * ```tsx
 * <div className="flex h-[24px] items-center"><Skeleton className="w-[180px]" /></div>
 * ```
 */
export type SkeletonProps = Omit<ComponentPropsWithoutRef<'span'>, 'children'> & {
    /** Any CSS width. Omit and it fills its container. */
    w?: number | string
    /** Defaults to the DS's 12px bar. Pass a number for a block (a cover, a button). */
    h?: number | string
    /** A round placeholder — an avatar, a badge, a social mark. */
    circle?: boolean
    /**
     * Milliseconds of animation delay. The DS staggers siblings by 160ms; `SkeletonStack` does
     * that for you, so this is for hand-arranged groups (a stat row, a grid).
     */
    delay?: number
}

function Skeleton({ className, w, h, circle = false, delay, style, ...props }: SkeletonProps) {
    const size = typeof w === 'number' ? `${w}px` : w
    const height = typeof h === 'number' ? `${h}px` : h

    return (
        <span
            data-slot="skeleton"
            // Decorative: the container announces the wait (`aria-busy`), so a screen reader
            // hearing every bar would be noise, not information.
            aria-hidden="true"
            className={cn(
                'block flex-none bg-(--opacity-labels-55) opacity-40',
                'animate-[tevi-msg-skeleton_1600ms_ease-in-out_infinite] motion-reduce:animate-none',
                circle ? 'rounded-[var(--radius-fill)]' : 'rounded-[4px]',
                !size && 'w-full',
                className,
            )}
            style={
                {
                    ...(size ? { width: size } : {}),
                    height: height ?? (circle ? size : '12px'),
                    ...(delay ? { animationDelay: `${delay}ms` } : {}),
                    ...style,
                } as CSSProperties
            }
            {...props}
        />
    )
}

/**
 * A column of bars with the DS's 8px gap and 160ms stagger.
 *
 * `aria-busy` lives here rather than on each bar, so assistive tech is told once that a region
 * is loading instead of being handed a list of decorations.
 */
function SkeletonStack({
    className,
    children,
    ...props
}: ComponentPropsWithoutRef<'div'>) {
    return (
        <div
            data-slot="skeleton-stack"
            aria-busy="true"
            className={cn('flex flex-col gap-2', className)}
            {...props}
        >
            {children}
        </div>
    )
}

/**
 * Bars at descending widths — the shape a paragraph actually has, since its last line is short.
 * Three lines at 100 / 96 / 60% is what the channel bio reserves.
 */
function SkeletonText({
    lines = 3,
    widths = ['100%', '96%', '60%'],
    className,
    ...props
}: ComponentPropsWithoutRef<'div'> & { lines?: number; widths?: string[] }) {
    return (
        <SkeletonStack className={className} {...props}>
            {Array.from({ length: lines }, (_, index) => (
                <Skeleton
                    key={index}
                    w={widths[index] ?? widths[widths.length - 1]}
                    delay={index * 160}
                />
            ))}
        </SkeletonStack>
    )
}

export { Skeleton, SkeletonStack, SkeletonText }
