'use client'

import { cn } from '@shared/lib/utils'
import type { ComponentPropsWithoutRef, KeyboardEvent } from 'react'

/**
 * Segmented Control — Figma, ported 1:1:
 *
 *   Segmented Control            122:27443  4v  Segments=2/3/4/5
 *   Segmented Control/Item       122:27436  2v  Selected=Yes/No
 *   Segmented Control/Underline  2261:6669  4v  Segments=2/3/4/5
 *   .../Underline Item           2261:6660  2v  Selected=Yes/No
 *
 * **The `Segments` axis is child count, not a prop.** Every container number is identical
 * across Segments=2/3/4/5 — only the number of children changes and each takes an equal
 * share of the track, so it is `flex: 1 1 0` on the children and nothing else. (Figma's
 * `Underline Segments=2` leaves both items at a fixed 181 inside a 370 track, which is an
 * authoring slip: 3/4/5 of the same set fill exactly. Normalised to fill here, as the DS
 * does.)
 *
 * `pill` and `underline` share no geometry at all — track 36 vs 48 tall, pad 4 vs 0,
 * radius 100 vs 0, filled+stroked vs bare; item 28 vs 48, radius Fill vs 0, background
 * swap vs bottom rule. What they share is the interaction contract (single-select
 * tablist, equal widths, roving focus, weight change on select), which is why this is one
 * component whose `variant` swaps the whole skin and the keyboard behaviour is written
 * once, here.
 *
 * ── engine notes ──────────────────────────────────────────────────────────────────
 * Every stroke is a Figma INSIDE/CENTER stroke, which does not grow the frame. A CSS
 * border would: it would push the pill track's 28px item to 27 and shift the underline
 * label 1px up. So all of them are `inset` box-shadows, which stay out of layout and
 * follow the radius. Chromium still snaps the 0.5px track hairline up to ~1 device px at
 * DPR 1; the declared value is Figma's 0.5.
 *
 * The pill track's radius is a raw 100 in Figma with no bound variable, so the literal is
 * kept rather than substituted with `--radius-fill` (9999). Both paint the same capsule at
 * 36px tall; the number stays honest.
 *
 * Type is 14 at both weights (`type-dense-emphasis` → `type-dense-strong` on select),
 * which is what Figma means by "only the weight moves".
 *
 * **Partial port.** `Segmented Control/Item Highlighted` (2391:10396) — the 185px option
 * card with a fee and a badge — is not here. It is a card, not a track segment, and the
 * screen that needs it should get it then rather than have it guessed at now.
 */

export type SegmentedControlVariant = 'pill' | 'underline'

const TRACK_BASE = 'box-border flex w-full gap-0 [&>*]:min-w-0 [&>*]:flex-1 [&>*]:basis-0'

const TRACK_VARIANT: Record<SegmentedControlVariant, string> = {
    pill: 'h-9 items-center rounded-[100px] bg-(--background-segment) p-1 shadow-[inset_0_0_0_0.5px_var(--zinc-300)]',
    underline: 'items-stretch p-0',
}

const ITEM_BASE =
    'type-dense-emphasis box-border m-0 flex cursor-pointer items-center border-0 bg-none transition-[background-color,color,box-shadow] duration-[120ms] ease-out outline-none [-webkit-tap-highlight-color:transparent] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--focus-ring) disabled:cursor-not-allowed [&_svg]:pointer-events-none [&_svg]:shrink-0'

const ITEM_VARIANT: Record<SegmentedControlVariant, string> = {
    // Both states use Text - Title in the pill; only the weight moves.
    pill: 'h-7 rounded-[var(--radius-fill)] bg-transparent px-2 py-1 text-(--text-title)',
    /*
     * The unselected rule is Figma's only CENTER-aligned stroke (it straddles the frame
     * edge at 47.5–48.5) while the selected one is 2px INSIDE at 46–48. Both are painted
     * flush inside: a 0.5px overhang on one of two adjacent segments reads as a
     * misalignment, and CENTER is a Figma default rather than a spec.
     */
    underline:
        'h-12 rounded-none px-2 py-3 text-(--text-subtitle) shadow-[inset_0_-1px_0_var(--separator-default)]',
}

const ITEM_SELECTED: Record<SegmentedControlVariant, string> = {
    pill: 'type-dense-strong bg-(--background-segment-focus) shadow-lg',
    underline: 'type-dense-strong text-(--text-title) shadow-[inset_0_-2px_0_var(--text-title)]',
}

/** Selectable segments, in DOM order — what the roving focus walks. */
const ITEM_SELECTOR = '[data-slot="segmented-control-item"]:not([disabled])'

/**
 * The track. Give it `role="tablist"` + `aria-label` (or `role="radiogroup"`, if the
 * segments are a value rather than a view) — the DS preview marks it up as a tablist and
 * that is the only arrangement that makes the arrow keys below mean anything.
 *
 * Arrow keys move focus **and** activate, which is the automatic-activation form of the
 * ARIA tabs pattern: correct when switching panels is instant and cheap, as it is
 * everywhere this is used. Left/Right follow the writing direction — swapped under
 * `dir="rtl"`, because in Arabic the first segment is the rightmost one and an arrow that
 * walked the DOM order would move the wrong way on screen.
 */
function SegmentedControl({
    variant = 'pill',
    className,
    onKeyDown,
    ...props
}: ComponentPropsWithoutRef<'div'> & { variant?: SegmentedControlVariant }) {
    function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
        onKeyDown?.(event)
        if (event.defaultPrevented) return

        const track = event.currentTarget
        const items = [...track.querySelectorAll<HTMLElement>(ITEM_SELECTOR)]
        const current = items.indexOf(document.activeElement as HTMLElement)
        if (current < 0) return

        const forward = getComputedStyle(track).direction === 'rtl' ? -1 : 1
        let next: number
        switch (event.key) {
            case 'ArrowRight':
                next = current + forward
                break
            case 'ArrowLeft':
                next = current - forward
                break
            case 'Home':
                next = 0
                break
            case 'End':
                next = items.length - 1
                break
            default:
                return
        }

        event.preventDefault()
        const target = items[(next + items.length) % items.length]
        target.focus()
        target.click()
    }

    return (
        <div
            data-slot="segmented-control"
            data-variant={variant}
            className={cn(TRACK_BASE, TRACK_VARIANT[variant], className)}
            onKeyDown={handleKeyDown}
            {...props}
        />
    )
}

/**
 * One segment. A `<button>`, so it is reachable and pressable without any of this file's
 * JavaScript; `selected` drives both the paint and `aria-selected`, and the unselected
 * segments leave the tab order (`tabIndex={-1}`) so the whole control is one stop.
 */
function SegmentedControlItem({
    variant = 'pill',
    selected = false,
    className,
    type = 'button',
    ...props
}: ComponentPropsWithoutRef<'button'> & {
    variant?: SegmentedControlVariant
    selected?: boolean
}) {
    return (
        <button
            data-slot="segmented-control-item"
            data-variant={variant}
            data-selected={selected || undefined}
            type={type}
            role="tab"
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            className={cn(
                ITEM_BASE,
                ITEM_VARIANT[variant],
                selected && ITEM_SELECTED[variant],
                className,
            )}
            {...props}
        />
    )
}

/** Figma's Label: a FILL child, centred, truncating rather than wrapping. */
function SegmentedControlItemLabel({ className, ...props }: ComponentPropsWithoutRef<'span'>) {
    return (
        <span
            data-slot="segmented-control-item-label"
            className={cn(
                'block min-w-0 flex-auto truncate text-center text-inherit',
                className,
            )}
            {...props}
        />
    )
}

/**
 * Figma's `Row` — the underline item's inner box when it carries a trailing glyph
 * (Figma's mis-named `Show count badge` boolean). The glyph keeps Icon - Default in both
 * states, as Figma binds it.
 */
function SegmentedControlItemRow({ className, ...props }: ComponentPropsWithoutRef<'span'>) {
    return (
        <span
            data-slot="segmented-control-item-row"
            className={cn(
                'flex min-w-0 flex-auto items-center justify-center gap-1 [&>svg]:text-(--icon-default)',
                className,
            )}
            {...props}
        />
    )
}

export {
    SegmentedControl,
    SegmentedControlItem,
    SegmentedControlItemLabel,
    SegmentedControlItemRow,
}
