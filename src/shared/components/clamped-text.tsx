'use client'

import { cn } from '@shared/lib/utils'
import { useEffect, useState } from 'react'

/**
 * Creator-authored prose, clamped with a **more / less** toggle.
 *
 * The mechanism only — the labels are props and the type/colour comes in through `className`, so it
 * carries no copy of its own and belongs to no feature. Two screens need it: the channel header's bio
 * (`features/channel/components/channel-description.tsx`) and the membership tier's pitch in the join
 * dialog. Both are a field somebody typed with no length the client can rely on.
 *
 * ## Measured, not assumed
 *
 * The toggle only appears when the text is **actually** overflowing, which is a layout question the
 * markup cannot answer: three lines of a wide column may be a whole bio, and the same text on a phone
 * may be six. `scrollHeight > clientHeight` on the clamped element is the measurement, re-taken on
 * resize — a hard-coded character count would show "more" on text that is already fully visible, and
 * hide it on text that is not.
 *
 * ## The depth is a literal per value, never interpolated
 *
 * Tailwind generates utilities from source text, so a `line-clamp-${lines}` built at runtime is a
 * class that exists in the markup and in no stylesheet — it fails as *no clamp at all*: the text
 * expands silently and nothing errors. So `lines` selects between written-out classes, and adding a
 * third depth means writing that literal too.
 *
 * The two callers differ on purpose. The bio is the channel header's own content and gets **three**;
 * the tier pitch in the join dialog gets **two**, because that dialog's height is capped and every
 * line it spends is a line taken from the benefits and the Join button below it.
 *
 * Plain text with `whitespace-pre-line`. **Never `dangerouslySetInnerHTML`** — this is
 * creator-authored, there is no sanitiser in the repo, and `docs/DEFINITION_OF_DONE.md` §8 calls
 * adding one without a sanitiser a blocker rather than a nit.
 */
export function ClampedText({
    text,
    lines = 3,
    moreLabel,
    lessLabel,
    className,
    testId,
}: {
    text: string
    /** Collapsed height, in lines. See the note above for why this is not an arbitrary number. */
    lines?: 2 | 3
    /** Shown while collapsed. One word, in the caller's locale. */
    moreLabel: string
    /** Shown while expanded. */
    lessLabel: string
    /** The paragraph's own type and colour — the callers do not agree on either. */
    className?: string
    /** The expand/collapse control's id — the only thing here a test presses. */
    testId?: string
}) {
    const [expanded, setExpanded] = useState(false)
    const [overflows, setOverflows] = useState(false)
    const [node, setNode] = useState<HTMLParagraphElement | null>(null)

    /*
     * `text` is in the dependency list although it is not read in here: the measurement is of the
     * DOM that `text` produced, and the observer below cannot cover it. While clamped the box is
     * `lines` tall whatever the content, so replacing four lines of prose with exactly two changes
     * `scrollHeight` and not `clientHeight` — no resize fires, and the "more" control stays up with
     * nothing left to reveal.
     */
    // biome-ignore lint/correctness/useExhaustiveDependencies: `text` re-measures a clamp the ResizeObserver cannot see change
    useEffect(() => {
        if (!node) return

        const measure = () => {
            // Only meaningful while clamped: expanded, `scrollHeight === clientHeight` by definition,
            // so measuring then would hide the control that collapses it again.
            if (expanded) return
            setOverflows(node.scrollHeight > node.clientHeight + 1)
        }
        measure()

        // The answer depends on the column's width, which changes with the viewport, with a rail
        // appearing at `md` and with a dialog resizing. `ResizeObserver` catches all three, plus a
        // font swap re-flowing the text.
        if (typeof ResizeObserver === 'undefined') return
        const observer = new ResizeObserver(measure)
        observer.observe(node)
        return () => observer.disconnect()
    }, [node, expanded, text])

    return (
        <div className="flex min-w-0 flex-col items-start gap-1">
            <p
                ref={setNode}
                className={cn(
                    'min-w-0 whitespace-pre-line break-words',
                    !expanded && (lines === 2 ? 'line-clamp-2' : 'line-clamp-3'),
                    className,
                )}
            >
                {text}
            </p>
            {overflows && (
                /*
                 * A plain text button, not a DS component: there is no disclosure primitive in the
                 * design system, and this is one word. `type-dense-emphasis` in `--text-link` is what
                 * the DS uses for an inline text action elsewhere.
                 *
                 * `aria-expanded` rather than swapping the label alone, so the control announces its
                 * state instead of relying on the word changing.
                 */
                <button
                    data-testid={testId}
                    type="button"
                    onClick={() => setExpanded(value => !value)}
                    aria-expanded={expanded}
                    className="type-dense-emphasis cursor-pointer rounded-[var(--radius-sm)] text-(--text-link) hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--focus-ring)"
                >
                    {expanded ? lessLabel : moreLabel}
                </button>
            )}
        </div>
    )
}
