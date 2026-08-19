'use client'

import { cn } from '@shared/lib/utils'
import type { ComponentPropsWithoutRef } from 'react'

/**
 * Radio — Figma "Checkbox & Radio" (48:10447), the `.tevi-radio` half of the same
 * component `checkbox.tsx` ports. Everything structural is deliberately identical to
 * `Checkbox`, because in the design system it *is* the same node with a different corner
 * radius and a different mark:
 *
 *   box     24 × 24
 *   radius  9999 (`--radius-fill`) — the only geometric difference from the rectangle
 *   ring    1.5px **inset shadow**, not a border (see `checkbox.tsx`; Chrome floors
 *           `border-width` to whole pixels and would paint 1px)
 *   mark    a filled dot, White on the checked Indigo fill
 *
 * The native input is a transparent 24 × 24 overlay rather than a hidden peer, for the same
 * three reasons as the checkbox: the whole box is the hit target, form and keyboard behaviour
 * are the platform's — which for a radio means **arrow keys move the selection within a
 * `name` group, and the group is one tab stop** — and `:checked` / `:disabled` /
 * `:focus-visible` drive the paint through `:has()` rather than React state. There is no
 * `data-state` to keep in sync, and no roving-tabindex to hand-roll.
 *
 * ── one value that is not a port ───────────────────────────────────────────────────────
 * **The dot's diameter is 8px by choice, not from the stylesheet.** The DS's own parts list
 * for this component is `.tevi-checkbox__mark` + `.tevi-choice__input` and nothing else, so
 * the radio's mark is drawn in CSS with no class to read it off — and `components.css` is
 * over the DesignSync `get_file` 256 KiB cap, so the rule itself is unreachable from here.
 * 8 in 24 sits on the same 1∶3 mark-to-box relationship as the checkbox's 18px check inside
 * its 24px box once its 3px inset is counted. Verify it on the next design sync; nothing
 * else in this file is a guess.
 *
 * Figma has no focus variant. The ring matches Button's and Checkbox's, which is the same
 * addition the DS stylesheet makes.
 *
 * ── `as`, and why a radio sometimes must not be a label ────────────────────────────────
 * The DS ships the root as a `<label>`, which is right for a bare control with its copy
 * beside it. It is wrong the moment the *row* is the label — a card you can click anywhere
 * to select — because nesting a label inside a label is invalid and browsers do not resolve
 * it the way the markup suggests. Pass `as="span"` there and let the outer
 * `<label htmlFor>` own the association; the input still lives in here, so the outer label
 * finds it as a descendant either way.
 */
export type RadioProps = Omit<ComponentPropsWithoutRef<'input'>, 'type' | 'size'> & {
    /**
     * `label` (the DS default) pairs the control with its own copy. `span` is for a host
     * that is itself a `<label>` — see above.
     */
    as?: 'label' | 'span'
    /** Classes for the painted box. Input props go to the input. */
    className?: string
}

export function Radio({ as: As = 'label', className, ...props }: RadioProps) {
    return (
        <As
            data-slot="radio"
            className={cn(
                'relative inline-flex size-6 shrink-0 cursor-pointer items-center justify-center',
                'rounded-(--radius-fill) bg-(--background-surface)',
                'shadow-[inset_0_0_0_1.5px_var(--zinc-300)]',
                'transition-[background-color,box-shadow] duration-[120ms] ease-out motion-reduce:transition-none',
                // Split unchecked / checked rather than layered: `:hover:has(:enabled)` alone
                // outranks `:has(:checked)` and would put the unchecked ring back on top of a
                // checked control. Same ordering as `Checkbox`.
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
                type="radio"
                data-slot="radio-input"
                className="absolute inset-0 m-0 size-full cursor-[inherit] appearance-none p-0 opacity-0"
                {...props}
            />
            {/*
             * Painted underneath the input, so it never eats the click.
             *
             * It scales in rather than appearing, which is the one place this control moves.
             * 120ms on the DS's own `ease-out` — the same transition the box's fill and ring
             * use above, so the dot lands as the fill arrives instead of a beat after it. It
             * scales inside a box that is already reserved by the 24px root, so nothing
             * around it reflows (the rule `shared/lib/motion.ts` states for `POP`).
             */}
            <span
                data-slot="radio-dot"
                aria-hidden="true"
                className={cn(
                    'pointer-events-none size-2 scale-0 rounded-(--radius-fill) bg-(--white) opacity-0',
                    'transition-[opacity,scale] duration-[120ms] ease-out motion-reduce:transition-none',
                    // Keyed on the root's `data-slot`, not on `label` / `span`, so the one
                    // selector covers both values of `as` — writing a rule per element type
                    // is how the `span` variant ends up shipping a radio that never fills.
                    '[[data-slot=radio]:has(>input:checked)>&]:scale-100',
                    '[[data-slot=radio]:has(>input:checked)>&]:opacity-100',
                )}
            />
        </As>
    )
}
