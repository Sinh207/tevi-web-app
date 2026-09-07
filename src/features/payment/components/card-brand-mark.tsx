'use client'

import {
    AmericanExpressFlatRoundedIcon,
    DinersClubFlatRoundedIcon,
    DiscoverFlatRoundedIcon,
    GenericFlatRoundedIcon,
    JCBFlatRoundedIcon,
    MaestroFlatRoundedIcon,
    MastercardFlatRoundedIcon,
    UnionPayFlatRoundedIcon,
    VisaFlatRoundedIcon,
} from 'react-svg-credit-card-payment-icons'

/**
 * The card scheme's own mark — Visa, Mastercard, Amex.
 *
 * ## Why a third-party package and not the DS sprite
 *
 * The sprite carries `address-card` and no scheme marks, and `docs/DESIGN_SYSTEM.md` is explicit that
 * a missing glyph must not be substituted or hand-drawn. These are also **trademarks** rather than
 * iconography: Visa's mark is Visa's, it is not the design system's to restyle, and the schemes
 * publish usage rules for it.
 *
 * So this is `react-svg-credit-card-payment-icons`, which is the package **legacy already uses** for
 * exactly this row (`containers/cardManagement/.../cardItem`, `PaymentIcon format='flatRounded'`).
 * Same art, same format, same size — which is what makes the screen match rather than resemble.
 *
 * ## Nine imports rather than the package's `PaymentIcon`
 *
 * `PaymentIcon` resolves a name at runtime, so it reaches all six format maps for every brand the
 * package ships — a 4.8 MB `dist` that mostly cannot appear on this screen. The nine named exports are
 * tree-shakeable, and nine is the whole set Stripe can actually answer with (`card.brand`) plus a
 * fallback. A brand that ships after this client renders `Generic`, which is a real card outline
 * rather than a gap.
 *
 * The art is **780:500**, so a `width` of 42 is 27 tall. `height` is left to the aspect ratio rather
 * than set, or the mark distorts at some widths.
 */

/** Stripe's `card.brand` values, lower-cased by `savedCardSchema`, to the mark that draws them. */
const MARKS = {
    visa: VisaFlatRoundedIcon,
    mastercard: MastercardFlatRoundedIcon,
    amex: AmericanExpressFlatRoundedIcon,
    discover: DiscoverFlatRoundedIcon,
    diners: DinersClubFlatRoundedIcon,
    jcb: JCBFlatRoundedIcon,
    unionpay: UnionPayFlatRoundedIcon,
    maestro: MaestroFlatRoundedIcon,
} as const

export function CardBrandMark({
    brand,
    width = 42,
    className,
}: {
    /** `card.brand` off the payload, or `null` for a saved method with no card block. */
    brand: string | null | undefined
    width?: number
    className?: string
}) {
    const Mark =
        (brand && MARKS[brand.trim().toLowerCase() as keyof typeof MARKS]) || GenericFlatRoundedIcon

    /*
     * `aria-hidden`: the row already names the brand in text (`savedCardTitle`), so announcing it
     * again is the same fact twice — and an unlabelled mark beside a labelled one is exactly the
     * duplication screen-reader users complain about.
     */
    return <Mark width={width} aria-hidden="true" focusable="false" className={className} />
}
