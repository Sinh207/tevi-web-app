'use client'

import { cn } from '@shared/lib/utils'
import {
    Card,
    CardContent,
    CardItem,
    CardItemIcon,
    CardItemMeta,
    CardItemTitle,
    CardMeta,
} from '@shared/ui/card'
import { Icon } from '@shared/ui/icon'
import type { ReactNode } from 'react'

/**
 * `/my-wallet`'s hero — "Total balance" and a currency control on one row, then the converted figure with
 * the underlying USD beneath it.
 *
 * `Card type="balance"` is pinned dark in **both** themes; the reason is on `BALANCE_TOKENS` in
 * `shared/ui/card.tsx` and it is not decorative — the DS binds the gradient to the Zinc ramp, which
 * *inverts* between modes, so the bound version would be a pale slab with white text on it in Light.
 *
 * ## Both figures, always — and the second one is the point
 *
 * The comp draws `₫157,155,000` over `$4,400.03`, and legacy does the same. It is not redundancy: the
 * balance is *held* in USD and displayed in the reader's unit at today's rate, so the USD line is the number
 * that will still be true tomorrow. A wallet showing only the converted figure would appear to change on its
 * own overnight.
 *
 * When the chosen currency **is** USD the two would be identical, so the caller omits the second line —
 * printing `$4,400.03` twice reads as a rendering bug.
 *
 * `currencyControl` is a slot rather than a built-in picker, so this component stays renderable without a
 * menu around it (the `/dev` preview does exactly that).
 */
export function TotalBalanceCard({
    label,
    value,
    /** The USD line. Omit when the display currency is already USD. */
    subValue,
    currencyControl,
    className,
}: {
    label: string
    value: ReactNode
    subValue?: ReactNode
    currencyControl?: ReactNode
    className?: string
}) {
    return (
        <Card type="balance" className={cn('flex-none', className)}>
            <CardMeta gap="8" justify="between" className="w-full">
                <CardItem type="large-item" tone="subtitle">
                    <CardItemMeta>{label}</CardItemMeta>
                </CardItem>
                {currencyControl}
            </CardMeta>
            <CardContent gap="0">
                {/* `subtitleLines` left at the DS default of 2, which is the comp's own override for this
                    card — a long converted figure may wrap. */}
                <CardItem type="title-subtitle" titleSize="32">
                    <CardItemTitle>{value}</CardItemTitle>
                </CardItem>
                {subValue !== undefined && (
                    <CardItem type="item" tone="subtitle">
                        <CardItemMeta>{subValue}</CardItemMeta>
                    </CardItem>
                )}
            </CardContent>
        </Card>
    )
}

/**
 * The currency control inside the card — a swap mark, then the code.
 *
 * ## The glyph is `arrows-repeat`, leading, and not a caret
 *
 * Read off the comp's own 16px SVG (two arrows pointing opposite ways) and off its position, which is
 * **before** the code. That matters: a trailing caret would say "this is a dropdown", while a leading swap
 * mark says "these figures can be shown in another unit" — which is what the control actually does. It is
 * also what makes the control legible on a card where the code is the only text.
 *
 * `iconTone="title"` is Figma's own instance override. The default ink for a card item's glyph is
 * Text - Placeholder, which on a black card is very nearly invisible; the comp repaints it Title.
 *
 * Rendered with no handler of its own, so the caller supplies the button — a `MenuTrigger` wraps it on the
 * real screen, and `/dev/my-wallet` renders it bare. Putting an `onClick` here would mean a button inside
 * whatever the caller wraps it in.
 */
export function CurrencyChip({ code, className }: { code: string; className?: string }) {
    return (
        <CardItem type="large-item" className={cn('cursor-pointer', className)}>
            <CardItemIcon tone="title">
                <Icon name="arrows-repeat" size={16} />
            </CardItemIcon>
            <CardItemMeta>{code}</CardItemMeta>
        </CardItem>
    )
}
