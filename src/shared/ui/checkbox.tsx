'use client'

import { cn } from '@shared/lib/utils'
import type { ComponentPropsWithoutRef } from 'react'
import { Icon } from './icon'

/**
 * Checkbox — Figma "Checkbox & Radio" (48:10447), ported 1:1.
 *
 * Geometry is the design system's, not shadcn's:
 *   box     24 × 24 at every variant
 *   radius  rectangle 4 (`--radius-sm`) · rounded 9999 (`--radius-fill`)
 *   mark    the sprite's filled `check`, 18 × 18, inset 3px in the 24 box
 *
 * **The 1.5px ring is an inset shadow, not a border.** Chrome floors `border-width` to
 * whole CSS pixels, so `border: 1.5px` computes *and paints* 1px; an inset shadow is not
 * floored, follows the radius, and costs no layout — which is how Figma's INSIDE stroke
 * is reproduced exactly. Do not "fix" it into a border. A checked box carries no stroke
 * in Figma at all, hence `shadow-none` there rather than a recoloured ring.
 *
 * The native input is a transparent 24 × 24 overlay rather than a hidden peer: it keeps
 * the real control on top of the paint, so the whole box is the hit target, the keyboard
 * and form behaviour are the platform's, and `:checked` / `:disabled` / `:focus-visible`
 * drive the styling through `:has()` instead of React state. That is why this component
 * has no `data-state` — there is nothing to keep in sync.
 *
 * Figma has no focus variant; the ring matches Button's, which is an addition rather than
 * a port (the DS stylesheet makes the same addition, with the same comment).
 *
 * The root is a `<label>`, as in the DS markup. It has no text of its own, so pair it with
 * a separate `<label htmlFor>` for the copy — and never nest this inside another label.
 */
export type CheckboxProps = Omit<ComponentPropsWithoutRef<'input'>, 'type' | 'size'> & {
    /** Figma's `Style` axis. Rectangle is the default; rounded is the pill-shaped one. */
    variant?: 'rectangle' | 'rounded'
    /** Classes for the painted box. Input props go to the input. */
    className?: string
}

export function Checkbox({ variant = 'rectangle', className, ...props }: CheckboxProps) {
    return (
        <label
            data-slot="checkbox"
            data-variant={variant}
            className={cn(
                'relative inline-flex size-6 shrink-0 cursor-pointer items-center justify-center',
                'bg-(--background-surface) text-(--white)',
                'shadow-[inset_0_0_0_1.5px_var(--zinc-300)]',
                'transition-[background-color,box-shadow] duration-[120ms] ease-out motion-reduce:transition-none',
                variant === 'rounded' ? 'rounded-(--radius-fill)' : 'rounded-(--radius-sm)',
                // Split unchecked / checked rather than layered: `:hover:has(:enabled)`
                // alone outranks `:has(:checked)` and would put the unchecked ring back
                // on top of a checked control.
                'hover:[&:has(>input:enabled:not(:checked))]:shadow-[inset_0_0_0_1.5px_var(--accents-indigo-active)]',
                '[&:has(>input:checked)]:bg-(--accents-indigo-active) [&:has(>input:checked)]:shadow-none',
                'hover:[&:has(>input:enabled:checked)]:bg-(--accents-indigo-focus)',
                '[&:has(>input:disabled)]:cursor-not-allowed [&:has(>input:disabled)]:bg-(--button-secondary-bg-disabled) [&:has(>input:disabled)]:shadow-[inset_0_0_0_1.5px_var(--button-secondary-text-disabled)]',
                '[&:has(>input:checked:disabled)]:bg-(--accents-indigo-disabled) [&:has(>input:checked:disabled)]:shadow-none',
                '[&:has(>input:focus-visible)]:outline-2 [&:has(>input:focus-visible)]:outline-offset-2 [&:has(>input:focus-visible)]:outline-(--focus-ring)',
                className,
            )}
        >
            <input
                type="checkbox"
                data-slot="checkbox-input"
                className="absolute inset-0 m-0 size-full cursor-[inherit] appearance-none p-0 opacity-0"
                {...props}
            />
            {/* Painted underneath the input, so it never eats the click. */}
            <Icon
                name="check"
                weight="filled"
                size={18}
                aria-hidden
                className="pointer-events-none opacity-0 [label:has(>input:checked)>&]:opacity-100"
            />
        </label>
    )
}
