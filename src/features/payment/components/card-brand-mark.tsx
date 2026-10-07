'use client'

import {
    AmericanExpress,
    DinersClub,
    Discover,
    Generic,
    JCB,
    Maestro,
    Mastercard,
    UnionPay,
    Visa,
} from 'react-svg-credit-card-payment-icons/icons/flat-rounded'

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
 * ## ⚠ From `icons/flat-rounded`, never from the package root
 *
 * The root barrel is what this used to import — nine named exports, on the belief that they would
 * tree-shake. They do not: the package declares no `sideEffects: false`, so webpack keeps every
 * module the barrel re-exports, and the build shipped **689 KB** of card art (every scheme, all six
 * formats, `PaymentIcon`'s metadata) in a chunk the session providers pull onto **every page**,
 * a guest's home included. The `icons/flat-rounded` entry imports only this one format, about
 * 130 KB of source at most; the components are the same ones — rendered markup compared equal for
 * all nine marks below.
 *
 * Nine is the whole set Stripe can actually answer with (`card.brand`) plus a fallback. A brand
 * that ships after this client renders `Generic`, which is a real card outline rather than a gap.
 *
 * The art is **780:500**, so a `width` of 42 is 27 tall. `height` is left to the aspect ratio rather
 * than set, or the mark distorts at some widths.
 */

/** Stripe's `card.brand` values, lower-cased by `savedCardSchema`, to the mark that draws them. */
const MARKS = {
    visa: Visa,
    mastercard: Mastercard,
    amex: AmericanExpress,
    discover: Discover,
    diners: DinersClub,
    jcb: JCB,
    unionpay: UnionPay,
    maestro: Maestro,
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
    const Mark = (brand && MARKS[brand.trim().toLowerCase() as keyof typeof MARKS]) || Generic

    /*
     * `aria-hidden`: the row already names the brand in text (`savedCardTitle`), so announcing it
     * again is the same fact twice — and an unlabelled mark beside a labelled one is exactly the
     * duplication screen-reader users complain about.
     */
    return <Mark width={width} aria-hidden="true" focusable="false" className={className} />
}
