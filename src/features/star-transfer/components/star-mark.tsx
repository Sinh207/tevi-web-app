'use client'

import { StarMark } from '@shared/components/star-mark'
import { useTranslation } from '@shared/i18n/use-translation'
import { formatStarAmount } from '@shared/lib/money'
import { cn } from '@shared/lib/utils'

/**
 * A Star figure with its mark — the inline pair this screen prints in eight places.
 *
 * It was written out longhand at every one of them: the same `<span class="flex items-center gap-1">`, the
 * same 14px mark, the same `tabular-nums`, the same `formatStarAmount(value, currentLanguage)`. Eight
 * copies of a two-element span is how a fee row ends up a pixel off a receiver row, so there is one.
 *
 * `tabular-nums` is the part worth keeping in one place: these figures sit in columns — a list of
 * receivers, a summary table — and proportional digits make a column of numbers look ragged.
 *
 * The **hero** figures (32px mark, Title typography, and on the bulk review a red state) are deliberately
 * *not* routed through this: three call sites with three different type utilities and a conditional colour
 * would need three props to say what one line of markup already says.
 */
export function StarAmount({
    value,
    size = 14,
    className,
    figureClassName,
}: {
    /** Signed as the caller means it — the history row passes a negative, everything else does not. */
    value: number
    size?: number
    /**
     * The pair's own box: `flex-none` in a row that must not let it shrink, `self-end` in a column.
     *
     * Layout belongs here and typography belongs on `figureClassName`, which is not pedantry — the two
     * were one prop for an hour and every layout class a caller passed landed on the *number* instead of
     * on the flex item, so the receipt's per-receiver amount quietly stopped being right-aligned.
     */
    className?: string
    /** Typography and colour for the figure. Defaults to the dense body style these rows use. */
    figureClassName?: string
}) {
    const { currentLanguage } = useTranslation()

    return (
        <span className={cn('flex items-center gap-1', className)}>
            <StarMark size={size} />
            <span
                className={cn(
                    'type-dense-default tabular-nums text-(--text-title)',
                    figureClassName,
                )}
            >
                {formatStarAmount(value, currentLanguage)}
            </span>
        </span>
    )
}
