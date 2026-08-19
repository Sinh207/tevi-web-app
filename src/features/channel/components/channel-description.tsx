'use client'

import { useTranslation } from '@shared/i18n/use-translation'
import { cn } from '@shared/lib/utils'
import { useEffect, useState } from 'react'

/**
 * The creator's bio: three lines, then "more".
 *
 * ## Why it is clamped
 *
 * A bio has no length limit worth relying on, and this block sits directly above the tab strip. An
 * un-clamped one pushes Posts off the first screen, which is the content people came for — so the
 * header grows to whatever the creator typed and the page reads as if it has no content.
 *
 * Legacy clamps it behind a `ReadMoreText`. An earlier version of this component deliberately did
 * *not*, on the grounds that a `line-clamp` with no way to expand hides content — which is right, and
 * is why this has the toggle rather than the clamp alone.
 *
 * ## Measured, not assumed
 *
 * The toggle only appears when the text is **actually** overflowing, which is a layout question the
 * markup cannot answer: three lines of a wide column may be a whole bio, and the same text on a phone
 * may be six. `scrollHeight > clientHeight` on the clamped element is the measurement, re-taken on
 * resize — a hard-coded character count would show "more" on text that is already fully visible, and
 * hide it on text that is not.
 *
 * Plain text with `whitespace-pre-line`. **Never `dangerouslySetInnerHTML`** — this is
 * creator-authored, there is no sanitiser in the repo, and `docs/DEFINITION_OF_DONE.md` §8 calls
 * adding one without a sanitiser a blocker rather than a nit.
 */
export function ChannelDescription({ text }: { text: string }) {
    const { t } = useTranslation()
    const [expanded, setExpanded] = useState(false)
    const [overflows, setOverflows] = useState(false)
    const [node, setNode] = useState<HTMLParagraphElement | null>(null)

    /*
     * `text` is in the dependency list although it is not read in here: the measurement is of the
     * DOM that `text` produced, and the observer below cannot cover it. While clamped the box is
     * three lines whatever the content, so replacing four lines of bio with exactly three changes
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

        // The answer depends on the column's width, which changes with the viewport and with the
        // rail appearing at `md`. `ResizeObserver` catches both, plus a font swap re-flowing the text.
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
                    'type-body-default min-w-0 whitespace-pre-line break-words text-(--text-title)',
                    !expanded && 'line-clamp-3',
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
                    type="button"
                    onClick={() => setExpanded(value => !value)}
                    aria-expanded={expanded}
                    className="type-dense-emphasis cursor-pointer rounded-[var(--radius-sm)] text-(--text-link) hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--focus-ring)"
                >
                    {expanded ? t('channel_show_less') : t('channel_show_more')}
                </button>
            )}
        </div>
    )
}
