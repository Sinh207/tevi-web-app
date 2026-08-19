import { cn } from '@shared/lib/utils'
import type { ComponentPropsWithoutRef, CSSProperties } from 'react'

/**
 * Loader — Figma "Loader" (31:3349), ported 1:1.
 *
 * A 24×24 frame holding three 4×4 dots at x = 3 / 10 / 17, gap 3, all in
 * `--opacity-labels-55`. The `Step` axis changes **nothing but opacity**: the lit dot walks
 * left → middle → right (1 / 0.75 / 0.75 → 0.75 / 1 / 0.75 → 0.75 / 0.75 / 1), which is a
 * keyframe rather than three components — hence the animation, with `step` for rendering one
 * frame statically.
 *
 * **Figma carries no timing.** 1200ms across the three steps (400ms a dot) is the DS
 * stylesheet's own choice, kept here so the two do not drift.
 *
 * This is the DS's "working…" indicator, and it is not a `Skeleton`: a skeleton stands in for
 * content whose shape is known, a loader says an operation is running. Use it inside a button,
 * or centred in a region waiting on something it cannot outline in advance.
 *
 * Under `prefers-reduced-motion` it holds Step 1 rather than strobing — a walking dot is
 * exactly the kind of small repeating movement that setting exists to stop.
 */
export type LoaderProps = Omit<ComponentPropsWithoutRef<'span'>, 'children'> & {
    /** Render one Figma frame with the walk switched off. Omit for the animation. */
    step?: 1 | 2 | 3
    /** Accessible name. Omit it and the loader is decorative — the region should say it. */
    label?: string
}

const DOT = 'size-[4px] flex-none rounded-[var(--radius-fill)] bg-(--opacity-labels-55)'

export function Loader({ className, step, label, ...props }: LoaderProps) {
    return (
        <span
            data-slot="loader"
            data-step={step}
            role={label ? 'status' : undefined}
            aria-label={label}
            aria-hidden={label ? undefined : true}
            className={cn('inline-flex size-6 items-center justify-center gap-[3px]', className)}
            {...props}
        >
            {[0, 1, 2].map(i => (
                <span
                    key={i}
                    className={cn(
                        DOT,
                        // Static frame: the lit dot is the one the caller asked for.
                        step ? (step === i + 1 ? 'opacity-100' : 'opacity-75') : 'opacity-75',
                        !step &&
                            'animate-[tevi-loader-dot_1200ms_steps(1,end)_infinite] motion-reduce:animate-none',
                        // Reduced motion holds Step 1, per the DS rule.
                        !step && i === 0 && 'motion-reduce:opacity-100',
                    )}
                    style={
                        !step && i > 0 ? ({ animationDelay: `${i * 400}ms` } as CSSProperties) : undefined
                    }
                />
            ))}
        </span>
    )
}
