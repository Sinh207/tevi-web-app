import { PremiumBadge } from '@shared/components/premium-badge'
import { PREMIUM_GOLD } from '@shared/lib/premium-gold'
import { cn } from '@shared/lib/utils'
import type { ReactNode } from 'react'

/**
 * A Premium account's avatar in the shell — the gold ring, with the crown hung off its bottom-end
 * corner, sparkling. Legacy's look: a gold-rimmed photo and a violet hexagon crown on the corner.
 *
 * It **fills its host**: the rail and the tab bar each draw a fixed avatar circle (24 / 22px) and
 * this paints the ring inside it, so the children must be sized `ring` px smaller on each side
 * (pass them a `className` — the avatar is the caller's, so is its size). The crown overflows the
 * circle on purpose, which means the host's circle must not clip: both DS shells do
 * (`overflow-hidden`), and the caller lifts that with an arbitrary variant on the item rather than
 * through a prop — `shared/ui` changes only to track the design system.
 *
 * Decorative throughout (`aria-hidden`): every host is a link that already names itself, and
 * Premium is said in words where it matters (the drawer's corner tab).
 */
export function PremiumAvatarFrame({
    badgeSize,
    className,
    badgeClassName,
    children,
}: {
    /** The crown, in px — about half the avatar's diameter reads like legacy's. */
    badgeSize: number
    /** The ring's thickness and anything else about the frame (`p-[2px]`). */
    className?: string
    /** Where the crown sits; defaults to straddling the bottom-end corner. */
    badgeClassName?: string
    children: ReactNode
}) {
    return (
        <span
            aria-hidden
            className={cn(
                'relative flex size-full items-center justify-center rounded-full p-[2px]',
                PREMIUM_GOLD,
                /*
                 * A soft halo in the ramp's own first stop. On a dark surface the 2px ring alone
                 * reads as a thin outline; the glow is what makes it read as *gold*. Fixed in both
                 * themes, like the gradient — on white it is faint, which is the right amount.
                 */
                'shadow-[0_0_8px_rgb(255_199_116/0.45)]',
                className,
            )}
        >
            {children}
            <PremiumBadge
                size={badgeSize}
                className={cn('absolute -end-1 -bottom-1', badgeClassName)}
            />
        </span>
    )
}
