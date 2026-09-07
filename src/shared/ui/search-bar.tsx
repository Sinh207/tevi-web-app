'use client'

import { subTestId, type TestIdProps } from '@shared/lib/test-id'
import { cn } from '@shared/lib/utils'
import { Icon } from '@shared/ui/icon'
import { type ComponentPropsWithoutRef, useRef, useState } from 'react'

/**
 * Search Bar — Figma, ported 1:1:
 *
 *   Search Bar   122:28484   3v   State=Default/Focused/Searching
 *
 * ## The three "States" are two DOM facts, so neither is a prop
 *
 * Measured: outer row 370 wide, hug 48, gap 8, no fill of its own.
 *
 * | State | what Figma draws |
 * |---|---|
 * | Default | the pill fills the whole row — `[leading 48 | field 322]`, no cancel |
 * | Focused | the pill narrows to 314 with 12px of end padding, and a 48px cancel appears beside it |
 * | Searching | the identical box to Focused; the only change is that the field has a value, so its ink is Text - Title rather than Text - Placeholder |
 *
 * So what actually varies is **focus** and **whether the input has a value** — the ink change is
 * already what a browser does with `::placeholder`. The component therefore takes neither as a
 * prop and derives `data-active` from `focused || value !== ''`, which is the DS's own note on
 * this component (*"Neither is a prop"*).
 *
 * One consequence worth stating, because it decides where focus lands: pressing cancel empties
 * the field but **keeps the bar active**, because focus returns to the input. Without that the
 * cancel button unmounts under the pointer that just pressed it and a keyboard user is dropped
 * to the top of the document by their own successful press — the same trap
 * `blocked-account-row.tsx` documents for `disabled`.
 *
 * ## `w-full`, not Figma's 370
 *
 * 370 is the mobile frame's content width, not a property of the control — every page that uses
 * one gives it the column. Normalised to fill, exactly as `SegmentedControl`'s track is (see the
 * `Segments` note there); `max-w-full` is kept so a narrow parent still contains it.
 *
 * ## engine notes
 *
 * The pill's 1px stroke is a Figma INSIDE stroke, which does not grow the frame. A CSS border
 * would: it would push the pill to 50 tall against the 48px leading slot inside it. So it is an
 * `inset` box-shadow, which stays out of layout and follows the radius — the same call every
 * stroke in `segmented-control.tsx` makes.
 *
 * The stroke colour really is `--background-surface` (Figma binds Background - Surface to it, not
 * a border token), which reads as a hairline *lift* against `--background-segment` rather than as
 * an outline. Reproduced rather than "corrected" to a `--separator-*`.
 *
 * The 24px radius is Figma's raw value on a 48px pill — i.e. a capsule — and is kept as the
 * literal rather than substituted with `--radius-fill`, for the reason the pill track's `100`
 * is kept in `segmented-control.tsx`: both paint the same shape and the number stays honest.
 *
 * `[&::-webkit-search-cancel-button]:hidden` is not DS geometry — it removes the **native** clear
 * glyph WebKit adds to `type="search"`, which would otherwise sit beside ours and clear the field
 * without telling React.
 */

export type SearchBarProps = Omit<
    ComponentPropsWithoutRef<'input'>,
    'className' | 'type' | 'value' | 'onChange' | 'ref'
> & {
    value: string
    onValueChange: (value: string) => void
    /**
     * Accessible name for the field. Required: the leading glyph is decorative, so without this
     * the input has no label at all.
     */
    label: string
    /** Accessible name for the cancel button — it is icon-only. */
    clearLabel: string
    className?: string
}

/**
 * A caller's `data-testid` stays on the **input** — that is the control, and moving it to the
 * wrapper would break the "the testid is on what you interact with" rule. The cancel button is
 * forwarded `${testId}-clear`, because it is reachable today only through
 * `data-slot="search-bar-cancel"`, and `data-slot` cannot be the automation contract: production
 * code selects on it (`segmented-control.tsx`, `app-side.tsx`, `metric-tabs.tsx`), so it is a
 * behaviour attribute that may move for behavioural reasons. No prop name is added and no geometry
 * changes — see the same forward in `dialog.tsx`, and `docs/TEST_IDS.md` for the contract.
 */
export function SearchBar({
    value,
    onValueChange,
    label,
    clearLabel,
    className,
    onFocus,
    onBlur,
    'data-testid': testId,
    ...props
}: SearchBarProps & TestIdProps) {
    const inputRef = useRef<HTMLInputElement>(null)
    const [focused, setFocused] = useState(false)
    const active = focused || value !== ''

    return (
        <div
            data-slot="search-bar"
            data-active={active ? 'true' : undefined}
            className={cn('box-border flex w-full max-w-full items-center gap-2', className)}
        >
            <div
                data-slot="search-bar-pill"
                className={cn(
                    'box-border flex h-12 min-w-0 flex-1 items-center rounded-[24px]',
                    'bg-(--background-segment) shadow-[inset_0_0_0_1px_var(--background-surface)]',
                    // Figma adds the end padding only once the cancel button is out.
                    active && 'pe-3',
                )}
            >
                {/*
                 * Figma models this as a 48px ghost Button, but it is not one: it has no action
                 * drawn for any State, and a pressable control that focuses the field beside it is
                 * two tab stops for one job. So it is a decorative span at the Button's geometry —
                 * `aria-hidden` via `Icon`'s own default, since no `title` is passed.
                 */}
                <span
                    data-slot="search-bar-leading"
                    className="flex size-12 flex-none items-center justify-center rounded-[var(--radius-lg)] bg-(--button-ghost-bg) text-(--text-title)"
                >
                    <Icon name="search" size={20} />
                </span>
                <input
                    {...props}
                    ref={inputRef}
                    data-testid={testId}
                    data-slot="search-bar-input"
                    type="search"
                    aria-label={label}
                    value={value}
                    onChange={event => onValueChange(event.target.value)}
                    onFocus={event => {
                        setFocused(true)
                        onFocus?.(event)
                    }}
                    onBlur={event => {
                        setFocused(false)
                        onBlur?.(event)
                    }}
                    className={cn(
                        'type-body-default h-12 min-w-0 flex-1 border-0 bg-transparent',
                        'text-(--text-title) caret-(--accents-indigo-active) outline-none',
                        'placeholder:text-(--text-placeholder)',
                        '[&::-webkit-search-cancel-button]:hidden',
                    )}
                />
            </div>

            {active && (
                <button
                    type="button"
                    data-slot="search-bar-cancel"
                    data-testid={subTestId(testId, 'clear')}
                    aria-label={clearLabel}
                    /*
                     * `onMouseDown` + `preventDefault` rather than relying on `onClick` alone: the
                     * pointer press blurs the input first, and with an empty field that flips
                     * `active` false and unmounts this button *before* the click lands. Keeping
                     * focus on the input makes the press survive; `.focus()` in the handler covers
                     * the keyboard path, where the button already holds focus and is about to go.
                     */
                    onMouseDown={event => event.preventDefault()}
                    onClick={() => {
                        onValueChange('')
                        inputRef.current?.focus()
                    }}
                    className="flex size-12 flex-none cursor-pointer items-center justify-center rounded-[var(--radius-fill)] border-0 bg-(--background-segment) px-4 py-2 text-(--text-title) outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--focus-ring)"
                >
                    <Icon name="xmark" size={20} />
                </button>
            )}
        </div>
    )
}
