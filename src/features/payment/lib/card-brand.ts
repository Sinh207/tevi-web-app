import type { SavedCard } from '../api/types'

/**
 * How a saved payment method prints.
 *
 * ## The design system has no card art
 *
 * The DS sprite carries a generic `credit-card` (since the 2026-10-08 library import) but no Visa /
 * Mastercard / Amex / JCB marks — and those are trademarks, not DS iconography (`docs/PAYMENT.md`
 * §4.7). So a row is **text**: `Visa ···· 4242`. When brand marks are supplied they
 * become assets under `public/`, and only `brandAssetName` below changes.
 *
 * ## Brands are an open set
 *
 * Stripe adds them. So the map holds the ones there is copy for, and anything else is prettified from
 * the wire value rather than dropped — the same rule, for the same reason, as
 * `features/membership/lib/payment-methods.ts`.
 */

/** Brands with a proper name. Keys are Stripe's own lower-cased values. */
const BRAND_NAMES: Record<string, string> = {
    visa: 'Visa',
    mastercard: 'Mastercard',
    amex: 'American Express',
    jcb: 'JCB',
    discover: 'Discover',
    diners: 'Diners Club',
    unionpay: 'UnionPay',
    eftpos_au: 'Eftpos',
    link: 'Link',
}

/** `american_express` → `American Express`. For a brand that ships after this client. */
function prettify(value: string): string {
    return value
        .trim()
        .split(/[_\s-]+/)
        .filter(Boolean)
        .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join(' ')
}

/**
 * The brand's display name, or `null` when the row carries no brand at all.
 *
 * `null` is a real case: a saved `link` or wallet method has no `card` block. The row then prints its
 * `type` (see `savedCardTitle`) rather than an empty space where a name should be.
 */
export function cardBrandName(brand: string | null | undefined): string | null {
    if (!brand) return null
    const key = brand.trim().toLowerCase()
    if (key === '') return null
    return BRAND_NAMES[key] ?? prettify(key)
}

/**
 * `···· ···· ···· 4242` — four groups, as the web app prints it.
 *
 * The **group count is the parity point**: one group reads as a fragment, four read as a card number,
 * and legacy's row is `**** **** **** {last4}`. The **glyph** is this client's one deviation — a middle
 * dot rather than an asterisk, because a screen reader says "dot dot dot dot" for it and "star star
 * star star" for the other, and the visual difference at 16px is nil.
 *
 * `null` when the payload had no last four — never a mask with nothing behind it. (Legacy renders
 * `**** **** **** undefined` for a saved wallet, which has no `card` block at all.)
 */
export function maskedCardNumber(last4: string | null | undefined): string | null {
    return last4 ? `···· ···· ···· ${last4}` : null
}

/** `05/2027`, or `null` when either half is missing. Never a half-date like `05/`. */
export function cardExpiry(
    month: number | null | undefined,
    year: number | null | undefined,
): string | null {
    if (!month || !year || month < 1 || month > 12) return null
    return `${String(month).padStart(2, '0')}/${year}`
}

/**
 * Whether the card is past its expiry.
 *
 * A card expires at the **end** of its month, so December 2026 is valid all through December 2026.
 * `now` is a parameter because a test that depends on the host clock is a test that fails one day in
 * the future for no reason.
 */
export function isCardExpired(
    month: number | null | undefined,
    year: number | null | undefined,
    now: Date,
): boolean {
    if (!month || !year) return false
    const lastMoment = Date.UTC(year, month, 1) // first instant of the following month
    return now.getTime() >= lastMoment
}

/**
 * Whether this method can be paid with **now**.
 *
 * A saved card past its expiry is a guaranteed decline: the charge fails at the scheme, the reader is
 * shown a payment error, and nothing on the way there told them why. So a checkout must not offer one —
 * and, more importantly, must not *pre-select* one, which is what happens when the expired card is also
 * the account's default.
 *
 * A method with **no expiry data** is payable: a wallet (`card: null`) has none, and a card whose
 * payload omitted the pair is unknown rather than dead — refusing it would be this client inventing a
 * decline. `isCardExpired` already answers `false` for both.
 */
export function isCardPayable(card: SavedCard, now: Date): boolean {
    return !isCardExpired(card.card?.exp_month, card.card?.exp_year, now)
}

/**
 * The card a checkout should start on: the **default, if it can be paid with**, else the first that
 * can, else `null`.
 *
 * `null` means "none of the saved cards is usable", which the panel reads as *open on a new method* —
 * the only thing left that can complete the payment. `pickDefaultCard` in `api/types.ts` deliberately
 * does **not** do this: `/card-management` lists cards to *manage*, and an expired one is exactly the
 * row a reader goes there to deal with.
 */
export function pickPayableCard(cards: readonly SavedCard[], now: Date): SavedCard | null {
    const payable = cards.filter(card => isCardPayable(card, now))
    return payable.find(card => card.default) ?? payable[0] ?? null
}

/**
 * The row's title: the brand when there is one, else the method type, else a neutral label key.
 *
 * Returns a **key** in the last case (`payment_card_unknown`) rather than an English string, because
 * that is the only branch where nothing came off the wire to print. The two other branches are wire
 * values and are untranslated by nature — the same narrow exception `prettifyPaymentMethod`
 * documents in `features/membership`.
 */
export function savedCardTitle(card: SavedCard): { text: string } | { key: string } {
    const brand = cardBrandName(card.card?.brand)
    if (brand) return { text: brand }
    if (card.type) return { text: prettify(card.type) }
    return { key: 'payment_card_unknown' }
}

/**
 * `Visa ···· 4242` — the one string that identifies a saved card to a person.
 *
 * **One group of dots, not `maskedCardNumber`'s four.** That function's own note calls the group
 * count the parity point: four groups are what make a bare number read as a *card number* rather
 * than a fragment. Put a brand in front and that work is already done — `Visa ···· ···· ···· 4242`
 * spends twelve dots restating what the word "Visa" said, in a row that truncates on a phone and
 * inside a sentence ("This will remove … from your account") where it is simply long. The four-group
 * form keeps its own caller: `pay-with-card-panel.tsx`, where the digits stand alone.
 *
 * Takes the **resolved** label rather than the card, so this file stays translator-free the way
 * `savedCardTitle` is: that function hands back a key when nothing came off the wire, and whoever
 * holds `t` turns it into words. `useCardName` is that whoever, and it is the only caller.
 *
 * It exists because three surfaces have to agree on the wording — the row's title and accessible
 * name, the delete confirmation and the expired-default warning — and a card named one way in the
 * list and another way in the dialog that destroys it is a reader checking they pressed the right
 * thing and being unable to tell.
 *
 * Falls back to the bare label when the payload carried no `last4`: `···· ` with nothing after it
 * names nothing, and a wallet has no digits to print at all.
 */
export function composeCardName(label: string, last4: string | null | undefined): string {
    return last4 ? `${label} ···· ${last4}` : label
}

/**
 * The asset base name a brand mark would live under, once the DS supplies them —
 * `public/payment-brands/<name>.svg`. `null` for a brand with no mark.
 *
 * Present in pass 1 so the row can be written once: today every call answers `null` and the row draws
 * text, and the day the assets land this is the only function that changes.
 */
export function brandAssetName(_brand: string | null | undefined): string | null {
    return null
}
