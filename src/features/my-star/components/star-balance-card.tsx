'use client'

import { StarMark } from '@shared/components/star-mark'
import { cn } from '@shared/lib/utils'
import { Card, CardItem, CardItemMeta, CardItemTitle, CardMeta } from '@shared/ui/card'
import type { ReactNode } from 'react'

/**
 * `/my-star`'s hero — "Star balance", then the 36px gold mark beside a 32px figure.
 *
 * `Card type="balance"` is pinned dark in **both** themes; the reason is on `BALANCE_TOKENS` in
 * `shared/ui/card.tsx` and it is not decorative — the DS binds the gradient to the Zinc ramp, which
 * *inverts* between modes, so the bound version would be a pale slab with white text on it in Light.
 * Nothing in this file re-states a colour: the ink tokens resolve correctly inside the card because the
 * card pins them.
 *
 * ## The Star mark is a raster image and must stay one
 *
 * It is gold with a gradient and a specular highlight, committed at `public/tevi-star.png` (the same
 * 72×72 file the DS embeds as a data URI in `preview/app-bar.html`). The sprite's flat `star` glyph is a
 * **different mark** — a single-colour outline — so substituting it is not a simplification, it is
 * drawing the wrong thing. `AppBarStarIcon` says the same and for the same reason.
 *
 * `alt=""` + `aria-hidden`: the figure beside it is already labelled "Star balance", so announcing the
 * mark would read the word twice.
 *
 * A separate component from `/my-wallet`'s `TotalBalanceCard` rather than one with a `variant`, because
 * the two are genuinely different compositions — one row of mark-plus-figure versus a header row over a
 * two-line value block — and they now live in different features. A shared shell would be a prop per
 * difference *and* a dependency between two screens.
 */
export function StarBalanceCard({
    label,
    value,
    className,
}: {
    label: string
    /** Pre-formatted — `formatStarAmount`, or `—`. Never a raw number. */
    value: ReactNode
    className?: string
}) {
    return (
        <Card type="balance" className={cn('flex-none', className)}>
            <CardItem type="large-item" tone="subtitle">
                <CardItemMeta>{label}</CardItemMeta>
            </CardItem>
            <CardMeta gap="4" justify="start" className="items-center">
                <StarMark size={36} className="block" />
                <CardItem type="title-subtitle" titleSize="32" subtitleLines={1} className="flex-1">
                    <CardItemTitle>{value}</CardItemTitle>
                </CardItem>
            </CardMeta>
        </Card>
    )
}
