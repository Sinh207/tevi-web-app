'use client'

import { cn } from '@shared/lib/utils'
import { Icon } from '@shared/ui/icon'
import { ListLeadingTile } from '@shared/ui/list'
import { Loader } from '@shared/ui/loader'
import { Radio } from '@shared/ui/radio'
import type { CSSProperties } from 'react'
import type { SpaceVisibilityOption as Option } from '../lib/space-visibility'

/**
 * One visibility choice, as a card you can click anywhere on.
 *
 * ## The accessibility shape, which is the whole reason this is not three divs
 *
 * The card is a `<label htmlFor>` and the control inside it is a real
 * `<input type="radio">` sharing one `name` with its siblings. That single decision buys
 * everything a hand-rolled version has to re-implement and usually gets wrong:
 *
 * - **the group is one tab stop, and arrow keys move the selection inside it** — the native
 *   radio-group behaviour, which `role="radio"` on a div does not give you;
 * - **clicking anywhere on the card selects it**, because a label activates its control;
 * - the checked, disabled and focus paint all come off `:checked` / `:disabled` /
 *   `:focus-visible` through `:has()` (see `shared/ui/radio.tsx`), so there is no React state
 *   mirroring the DOM's own.
 *
 * `aria-labelledby` and `aria-describedby` are the deliberate part. Without them the input's
 * accessible name would be *everything* the label wraps — the title, the whole consequence
 * paragraph and all seven bullets read out as the name of the control, on every arrow press.
 * Pointing `aria-labelledby` at the title alone overrides that (it outranks the label
 * element), and `aria-describedby` gives the consequences back as a *description*, which
 * assistive tech announces separately and can be skipped. The click target does not change:
 * the label still owns the input either way.
 *
 * ## The two states that are not "checked"
 *
 * `busy` is this option's own write being in flight. It replaces the "Current" badge rather
 * than adding a spinner somewhere — the radio has already moved (the write is optimistic), so
 * the honest thing to report is not *whether* it is selected but whether it has landed. The
 * badge slot is a fixed height, so the swap does not move the card.
 *
 * `aria-disabled`, never `disabled`, while some other write is running. `disabled` would blur
 * the radio the person just pressed and drop the keyboard to the top of the document — the
 * same trap `privacy-security-screen.tsx` documents for its toggles. The click handler is what
 * actually refuses; the attribute is what says so.
 */
export function SpaceVisibilityOption({
    option,
    name,
    id,
    label,
    body,
    bullets,
    checked,
    /** The saved value, as opposed to `checked` — see the `busy` note above. */
    current,
    currentLabel,
    busy,
    softDisabled,
    onSelect,
    className,
    style,
}: {
    option: Option
    name: string
    id: string
    label: string
    body: string
    bullets: string[]
    checked: boolean
    current: boolean
    currentLabel: string
    busy: boolean
    softDisabled: boolean
    onSelect: () => void
    /** The host's entrance animation — the card owns its own paint, not its arrival. */
    className?: string
    style?: CSSProperties
}) {
    const titleId = `${id}-title`
    const bodyId = `${id}-body`

    return (
        <label
            htmlFor={id}
            style={style}
            className={cn(
                'flex w-full min-w-0 cursor-pointer items-start gap-3 rounded-xl p-4',
                'bg-(--background-surface)',
                /*
                 * The card's own ring, and the DS Card `basic` variant's: a 1px **inset
                 * shadow**, not a border. Inset because it must not grow the box — a card
                 * that gains a pixel when you select it nudges every card below it — and a
                 * shadow because Chrome floors `border-width`, which is the same reason
                 * `Checkbox` and `Alert` draw their strokes this way.
                 *
                 * Selected swaps the hairline for the radio's own Indigo and lays the
                 * Indigo background tint under it, so the card and the control agree. 120ms
                 * on `ease-out` is the transition `Radio` uses for its fill, so the card and
                 * the dot arrive together rather than a beat apart.
                 */
                'shadow-[inset_0_0_0_1px_var(--button-secondary-border)]',
                'transition-[box-shadow,background-color,scale] duration-[120ms] ease-out',
                'motion-reduce:transition-none',
                checked &&
                    'bg-(--accents-indigo-bg-active) shadow-[inset_0_0_0_1.5px_var(--accents-indigo-active)]',
                // Hover only lifts the hairline of an *unselected* card; a selected one is
                // already at its strongest and would flicker between two blues.
                !checked &&
                    !softDisabled &&
                    'hover:shadow-[inset_0_0_0_1px_var(--accents-indigo-disabled)]',
                // Press feedback. 0.99, not 0.98: the card is up to 300px tall, and a scale
                // that reads as a nudge on a button reads as the layout collapsing on a card.
                !softDisabled && 'active:scale-[0.99] motion-reduce:active:scale-100',
                softDisabled && 'cursor-progress',
                className,
            )}
        >
            {/*
             * The 32px tile, the same one every settings row in this app wears
             * (`ListLeadingTile`). Its paint arrives through the DS's own two custom
             * properties rather than a class per colour — renaming them would silently fall
             * back to Indigo, which is why `list.tsx` says not to.
             */}
            <ListLeadingTile
                style={{ '--tevi-left-bar-tile': option.tile } as CSSProperties}
                /* Centred on the **title row**, not on the card: the leading mark lines up with
                   the words it belongs to, the way it does in every list row in this app. The
                   tile is 32 and the row is 24, so that is 4px of negative margin — measured,
                   not guessed (the tile sat 6px low with the `mt-[2px]` this replaces). */
                className="mt-[-4px]"
            >
                <Icon {...option.icon} size={20} />
            </ListLeadingTile>

            <span className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="flex min-w-0 items-center gap-2">
                    <span id={titleId} className="type-body-strong min-w-0 text-(--text-title)">
                        {label}
                    </span>
                    {/*
                     * Fixed height so the badge and the loader can swap without the title row
                     * changing height — the reservation `POP`-style entrances require
                     * (`shared/lib/motion.ts`).
                     */}
                    <span className="flex h-[24px] flex-none items-center">
                        {busy ? (
                            /* The DS Loader at its own 24, not resized: it is a 24 frame with
                               three 4px dots at fixed x positions, so shrinking it crowds
                               them. The slot is sized to the loader instead. */
                            <Loader />
                        ) : current ? (
                            <span
                                className={cn(
                                    'type-micro-overline rounded-(--radius-fill) px-2 py-[2px]',
                                    'bg-(--accents-indigo-active) text-(--white)',
                                    // Lands rather than appears: this badge only ever shows up
                                    // *because* something just became true, which is exactly
                                    // what `tevi-pop` is for. Its box is reserved above.
                                    'animate-[tevi-pop_240ms_cubic-bezier(0.32,0.72,0,1)_both]',
                                    'motion-reduce:animate-none',
                                )}
                            >
                                {currentLabel}
                            </span>
                        ) : null}
                    </span>
                </span>

                <span id={bodyId} className="flex min-w-0 flex-col gap-1">
                    <span className="type-dense-default text-(--text-subtitle)">{body}</span>
                    {bullets.length > 0 && (
                        /*
                         * A real `<ul>`, so the consequences are announced as a list of seven
                         * things rather than one run-on sentence — and `ps-4`/logical padding
                         * so the markers sit inside the card in Arabic too (`pnpm lint:rtl`).
                         */
                        <ul className="type-dense-default flex list-disc flex-col gap-[2px] ps-4 text-(--text-subtitle)">
                            {bullets.map(bullet => (
                                <li key={bullet}>{bullet}</li>
                            ))}
                        </ul>
                    )}
                </span>
            </span>

            {/*
             * **The focus ring stays on the radio, not on the card**, and that is a decision
             * rather than an omission. A ring around a 300px-tall card would be easier to
             * spot, but the control's own ring is the design system's answer
             * (`shared/ui/radio.tsx`, matching Button's) and the two cannot both be shown
             * without two concentric outlines 4px apart. Verified with the keyboard: Tab
             * enters the group at the checked option and the arrow keys move the selection,
             * so the ring is always on the thing that just changed.
             */}
            <Radio
                data-testid="channel-visibility-option"
                // `span`, not the DS default `label` — the card above is already the label,
                // and a label inside a label is invalid (see `shared/ui/radio.tsx`).
                as="span"
                /* No top margin: the radio and the title row are both 24 tall, so they centre on
                   each other as they are. The `mt-[12px]` this replaces pushed it a clear 12px
                   below the title — visible in the RTL screenshot before anywhere else. */
                className="flex-none"
                id={id}
                name={name}
                value={option.value}
                checked={checked}
                aria-labelledby={titleId}
                aria-describedby={bodyId}
                aria-disabled={softDisabled || undefined}
                /*
                 * `onChange`, not `onClick`: it is the event a radio fires for every way of
                 * selecting it, including the arrow keys, which never produce a click.
                 *
                 * Re-selecting the current option fires nothing at all (the DOM does not
                 * change), so the no-op case never reaches the caller from here — which is
                 * why `isSpaceVisibilityChange` exists as a second gate for the paths that
                 * *can* (a stale render, a programmatic call).
                 */
                onChange={() => {
                    if (softDisabled) return
                    onSelect()
                }}
            />
        </label>
    )
}
