'use client'

import { cn } from '@shared/lib/utils'
import { Icon } from '@shared/ui/icon'
import type { ReactNode } from 'react'

/**
 * A labelled section that folds — the payout detail screen's two accordions.
 *
 * ## Native `<details>`, and the DS has no accordion
 *
 * Reported rather than approximated, per `docs/DESIGN_SYSTEM.md`: `components.md` lists 34 components
 * and none of them is a disclosure. `donate-dialogs.tsx` reached the same conclusion and the same
 * answer, so this follows it — a native `<details>` / `<summary>` wearing DS tokens.
 *
 * Native rather than `useState` + `aria-expanded`: `<details>` is a disclosure to every screen reader
 * *and* to find-in-page, which expands it to reach a match inside — a folded fee breakdown is exactly
 * the kind of thing somebody searches the page for. It also keeps working if hydration never happens.
 *
 * ## Which one starts open is per-section, and legacy's screen is the reference
 *
 * `// defaultExpanded` is commented out in legacy's source, but its **shipped screen** has the withdraw
 * detail expanded and the status history collapsed — the chevrons in a screenshot of the live app point
 * opposite ways. So the source's commented-out line is not the answer; the screen is.
 *
 * It reads correctly too: the fee breakdown is *why the number at the top is what it is*, so a reader
 * who came for the amount is one glance from the derivation. The status history is a log — useful when
 * something looks wrong, noise the rest of the time.
 *
 * ## `open` is a **default**, not a controlled value
 *
 * `<details open={defaultOpen}>` sets the attribute on mount, and React only patches it when the prop's
 * value changes. Since `defaultOpen` never changes for a given section, a reader's own toggle sticks —
 * the DOM state moves and React leaves it alone. A `useState` mirror would be a second copy of a state
 * the element already owns, and the two would drift the first time something else re-rendered.
 */
export function PayoutDisclosure({
    label,
    /** Shown on the summary row beside the label — the one-line answer for a reader who does not open it. */
    summary,
    /** Start expanded. See the note above on why this is a default rather than a controlled value. */
    defaultOpen = false,
    children,
    className,
}: {
    label: string
    summary?: ReactNode
    defaultOpen?: boolean
    children: ReactNode
    className?: string
}) {
    return (
        <details open={defaultOpen} className={cn('group/disclosure', className)}>
            {/*
             * `list-none` **and** the WebKit pseudo-element: Safari draws its own triangle and ignores
             * the standard property, so without both the row gets a second, unstyled marker on one
             * engine only.
             */}
            <summary
                className={cn(
                    'flex cursor-pointer list-none items-center justify-between gap-3 py-3',
                    'outline-none [&::-webkit-details-marker]:hidden',
                    'focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-(--focus-ring)',
                )}
            >
                <span className="type-dense-default text-(--text-body)">{label}</span>
                <span className="flex min-w-0 items-center gap-2">
                    {summary}
                    {/*
                     * `angle-down`, rotated when open. `group-open/disclosure:` is the state selector
                     * `<details>` gives for free — no JS, and it cannot fall out of step with the
                     * element's real state the way a `useState` mirror can.
                     */}
                    <Icon
                        name="angle-down"
                        size={20}
                        aria-hidden
                        className="flex-none text-(--icon-default) transition-transform duration-200 group-open/disclosure:rotate-180 motion-reduce:transition-none"
                    />
                </span>
            </summary>
            <div className="pb-3">{children}</div>
        </details>
    )
}
