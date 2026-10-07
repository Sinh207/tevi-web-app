import { RIPPLE } from '@shared/lib/motion'
import { cn } from '@shared/lib/utils'

/**
 * The red "on air" dot — Figma's `Container` mark from the home page's Lives tab and the
 * *Happening now* row of a live card (`Live Display Improvements`, node `3613:16984`).
 *
 * Three concentric discs, 14 / 10 / 6, at 10% / 50% / 100% of the error accent. Figma's note on the
 * screen asks for the ring to move ("animation dot red ring"), so the outermost disc carries
 * `RIPPLE` — two of them, half a period apart, which is the constant's own instruction for a steady
 * pulse. The core never moves: it is the indicator, the rings are only its emphasis. Under reduced
 * motion the travelling rings are hidden and the three static discs are exactly the drawn frame.
 *
 * Decorative by construction (`aria-hidden`): every caller sits it beside words that already say
 * "live", so announcing it would say it twice.
 */
export function LiveDot({ className }: { className?: string }) {
    return (
        <span aria-hidden className={cn('relative inline-flex size-3.5 flex-none', className)}>
            <span className="absolute inset-0 rounded-full bg-(--accents-error-active)/10" />
            <span
                className={cn(
                    'absolute inset-0 rounded-full bg-(--accents-error-active)/40',
                    RIPPLE,
                )}
            />
            <span
                className={cn(
                    'absolute inset-0 rounded-full bg-(--accents-error-active)/40 [animation-delay:1200ms]',
                    RIPPLE,
                )}
            />
            <span className="absolute inset-0.5 rounded-full bg-(--accents-error-active)/50" />
            <span className="absolute inset-1 rounded-full bg-(--accents-error-active)" />
        </span>
    )
}
