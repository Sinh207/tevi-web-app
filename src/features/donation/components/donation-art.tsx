'use client'

import { Icon } from '@shared/ui/icon'
import Image from 'next/image'
import { useState } from 'react'
import type { DonationIcon } from '../api/types'
import { DONATION_ART } from '../lib/illustrations'

/**
 * The unit's picture — a coffee, a pizza, a book, a rose.
 *
 * ## Why it has a fallback at all
 *
 * Two independent ways to end up with nothing to draw, and both are ordinary rather than defensive:
 * the offer names an `icon` this client has no art for (`null` after parsing — the backend can add a
 * fifth any day), or the image request fails. Legacy has neither guard: it indexes its art map with the
 * raw value and hands `undefined` to `<Image src>`, which throws in dev and draws a broken tile in
 * production, in all four places the art appears.
 *
 * The fallback is the DS sprite's **gift** glyph, not a stand-in coffee. Substituting one of the four
 * for another would tell the reader they are buying something they are not; a gift is the category,
 * which is the only honest thing to say when the specific art is unavailable. `CLAUDE.md`'s rule
 * against inventing a glyph is about the sprite, and this is the reason behind it: a shape that is
 * nearly right reads as information.
 */
export function DonationArt({
    icon,
    size = 24,
    className,
}: {
    icon: DonationIcon | null
    /** Constrained to the sprite's own component sizes, so the fallback glyph is never off-scale. */
    size?: 16 | 20 | 24 | 32
    className?: string
}) {
    const src = icon ? DONATION_ART[icon] : null
    /**
     * Keyed on `src`, so a failure belongs to **that** image and not to the component.
     *
     * This component instance survives a client-side navigation between two channels (same route
     * segment, same position in the tree), so a plain `useState(false)` meant one flaky `coffee.webp`
     * request latched the generic glyph for every offer the reader saw afterwards — telling them the
     * client has no art for a metaphor it does have.
     */
    const [failedSrc, setFailedSrc] = useState<string | null>(null)
    const failed = failedSrc !== null && failedSrc === src

    if (!src || failed) {
        return <Icon name="gift-simple" size={size} className={className} aria-hidden />
    }

    return (
        <Image
            src={src}
            alt=""
            aria-hidden
            width={size}
            height={size}
            className={className}
            onError={() => setFailedSrc(src)}
        />
    )
}
