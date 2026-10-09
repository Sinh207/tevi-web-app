import { StarMark } from '@shared/components/star-mark'
import { cn } from '@shared/lib/utils'
import type { ReactNode } from 'react'

/**
 * A Star price inside a sentence — the number in the strong weight with the Star mark after it.
 *
 * Handed to `Trans` as a component, so the translated string decides where the price sits
 * (`"Fans pay <0>{{tier}}</0> to react…"`) and `Trans` fills `children` with the number. Legacy splits
 * the English string on `[%s]` instead, which breaks in any locale whose sentence puts the number
 * elsewhere.
 */
export function StarAmount({
    children,
    size = 14,
    className,
}: {
    children?: ReactNode
    size?: number
    className?: string
}) {
    return (
        <strong
            className={cn('inline-flex items-center gap-0.5 align-middle font-bold', className)}
        >
            {children}
            <StarMark size={size} />
        </strong>
    )
}
