import { cn } from '@shared/lib/utils'
import type { ComponentPropsWithoutRef } from 'react'

/**
 * Toggle — Figma "Toggle" 48:10605, ported 1:1 from the DS `preview/toggle.html`.
 *
 * Geometry, all read off the Figma nodes rather than inferred:
 *
 *   Track  48 × 28, padding 2 on all four sides, cornerRadius 100, no stroke
 *   Knob   24 × 24, cornerRadius 100, fill White
 *   Travel 20px — *measured* (knob.x is 2 in `State=Off`, 22 in `State=On`), which
 *          happens to agree with 48 − 2 − 24 − 2
 *
 * The `100px` radius is literal on purpose: Figma binds only `fills` on these nodes, so
 * the corner is a raw 100 and not `--radius-fill`. Both paint the same pill; 100 is what
 * the file says, and the DS reproduces it verbatim.
 *
 * Figma models `State` and `Disabled` as four separate variants. Here `State` is
 * `aria-checked` on a real `role="switch"` and `Disabled` is the native attribute, so one
 * element covers all four — which is also the only version of this control a screen
 * reader can operate.
 *
 * ── the one thing the DS could not tell us ─────────────────────────────────────────────
 * The DS moves the knob with `translateX(20px)`, authored LTR-only. Under `dir="rtl"` the
 * track mirrors but a positive X still travels *right*, so a switch turned on would send
 * its knob into the track's start edge and sit there. The `rtl:` variant flips the sign;
 * this is the app's addition, not the design system's.
 */

export type ToggleProps = Omit<
    ComponentPropsWithoutRef<'button'>,
    'children' | 'role' | 'aria-checked' | 'onChange' | 'type'
> & {
    checked: boolean
    /**
     * Called with the value the switch is being moved *to*. Named for what it reports
     * rather than for the DOM event, because the caller almost always sends it straight
     * at a mutation and never looks at the event.
     */
    onCheckedChange: (checked: boolean) => void
}

function Toggle({
    checked,
    onCheckedChange,
    className,
    disabled,
    'aria-disabled': ariaDisabled,
    onClick,
    ...props
}: ToggleProps) {
    /**
     * Two ways to be unavailable, and they are not interchangeable.
     *
     * `disabled` is the native attribute for a switch that cannot be operated at all — and
     * it takes the control **out of the tab order**, which is right for "you may not touch
     * this" and wrong for "wait a moment": the browser blurs a focused element the instant
     * it becomes disabled, so a keyboard user who presses Space and triggers a save would
     * have focus dropped to `<body>` and have to Tab in from the top of the document again.
     *
     * `aria-disabled` is therefore the one to use for a pending write: the switch keeps its
     * focus and its place in the tab order, still announces itself, and simply refuses to
     * act. It is the pattern the rest of the app already uses for exactly this
     * (`data-storage-screen.tsx`, and `menu-drawer.tsx`'s sign-out row).
     *
     * Both paint the DS's disabled fills, because both mean the same thing to the eye.
     */
    const softDisabled = ariaDisabled === true || ariaDisabled === 'true'
    const unavailable = disabled === true || softDisabled

    return (
        <button
            type="button"
            role="switch"
            aria-checked={checked}
            disabled={disabled}
            aria-disabled={ariaDisabled}
            data-slot="toggle"
            onClick={event => {
                onClick?.(event)
                if (event.defaultPrevented) return
                // `disabled` is enforced by the browser; `aria-disabled` is a promise this
                // handler has to keep itself.
                if (softDisabled) return
                onCheckedChange(!checked)
            }}
            className={cn(
                'relative box-border inline-flex h-[28px] w-[48px] flex-none items-center justify-start',
                'rounded-[100px] border-0 p-[2px] [-webkit-tap-highlight-color:transparent]',
                'outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--focus-ring)',
                'transition-[background-color] duration-[160ms] ease-[ease] motion-reduce:transition-none',
                /*
                 * The track is 28 tall and a touch target should be 40 (DoD §4), so the
                 * remaining 12 come from a transparent overlay rather than from geometry the
                 * design system fixed. `absolute` is load-bearing: a `::before` on a flex
                 * container is a flex *item*, so in flow it would be laid out before the knob
                 * and push it off centre. Six pixels a side stays well inside the 48px row.
                 */
                "before:absolute before:inset-x-0 before:-inset-y-[6px] before:content-['']",
                unavailable ? 'cursor-not-allowed' : 'cursor-pointer',
                // Four fills, one per Figma variant. The Zinc ramp inverts between modes,
                // so the "off" track stays a low-contrast neutral in both.
                unavailable && checked && 'bg-(--accents-success-disabled)',
                unavailable && !checked && 'bg-(--zinc-200)',
                !unavailable && checked && 'bg-(--accents-success-active)',
                !unavailable && !checked && 'bg-(--zinc-300)',
                className,
            )}
            {...props}
        >
            <span
                data-slot="toggle-knob"
                aria-hidden="true"
                className={cn(
                    'size-[24px] flex-none rounded-[100px] bg-(--white)',
                    /*
                     * `transition-transform`, not a hand-written `transition-[transform]`:
                     * Tailwind v4's `translate-x-*` set the `translate` property, which a
                     * list naming only `transform` does not cover — the knob would jump.
                     * The shorthand utility expands to `transform, translate, scale, rotate`.
                     */
                    'transition-transform duration-[160ms] ease-[ease] motion-reduce:transition-none',
                    checked ? 'translate-x-[20px] rtl:-translate-x-[20px]' : 'translate-x-0',
                )}
            />
        </button>
    )
}

export { Toggle }
