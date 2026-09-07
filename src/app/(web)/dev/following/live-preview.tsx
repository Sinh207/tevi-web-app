'use client'

import { type FollowedLive, FollowingLiveRow } from '@features/channel'
import { Button } from '@shared/ui/button'
import { useState } from 'react'

/**
 * The Live now strip, with its "Show more" — the disclosure the real screen only draws for somebody
 * who follows more than five live creators at once, which is not a state a developer can arrange.
 *
 * `FOLLOWED_LIVES_COLLAPSED` is 5 in the shipped hook; this collapses at **2** so the button appears
 * with four fixtures. That is the one number here that is not the product's, and it is a property of
 * the preview rather than of the strip: the row and the badge over its banner are the shipped
 * component with the shipped rules.
 */
const COLLAPSED = 2

export function FollowingLivesPreview({ lives }: { lives: FollowedLive[] }) {
    const [expanded, setExpanded] = useState(false)
    const visible = expanded ? lives : lives.slice(0, COLLAPSED)

    return (
        <div className="overflow-hidden bg-(--background-surface) md:rounded-[var(--radius-xl)]">
            <ul className="flex list-none flex-col gap-3 p-4">
                {visible.map(live => (
                    <FollowingLiveRow key={live.code} live={live} locale="en" />
                ))}
            </ul>
            <div className="flex justify-center pb-4">
                <Button
                    variant="ghost"
                    size="small"
                    aria-expanded={expanded}
                    onClick={() => setExpanded(value => !value)}
                >
                    {expanded ? 'Show less' : 'Show more'}
                </Button>
            </div>
        </div>
    )
}
