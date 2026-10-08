'use client'

import { VerifiedBadge } from '@shared/components/verified-badge'
import { cn } from '@shared/lib/utils'

/**
 * **A sentence with a channel's name in it, and the channel's blue tick after the name.**
 *
 * Every place a space is named gets its verification mark, so a reader can tell the real channel
 * from a lookalike in the same breath as reading its name — not only where there happens to be a
 * row for a badge. The name goes in as `NAME_SLOT` and the sentence is split on it, so the
 * translation decides where the name falls and the tick follows it in every locale. A sentence
 * that lost the slot falls back to the plain text.
 */
export const NAME_SLOT = '\u0000'

export function NameWithTick({
    sentence,
    name,
    tick,
    nameClassName,
}: {
    sentence: string
    name: string
    tick: string | null | undefined
    nameClassName?: string
}) {
    const parts = sentence.split(NAME_SLOT)
    if (parts.length !== 2) return <>{sentence.replace(NAME_SLOT, name)}</>
    return (
        <>
            {parts[0]}
            <span className={cn('inline-flex items-center gap-1 align-middle', nameClassName)}>
                {name}
                {tick && <VerifiedBadge image={tick} size="caption" />}
            </span>
            {parts[1]}
        </>
    )
}
