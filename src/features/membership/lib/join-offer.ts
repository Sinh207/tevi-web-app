import type { MembershipPackage } from '../api/types'

/**
 * Whether a space's tier can be **joined** from this app, and at what price.
 *
 * The mirror of `renewalOffer`, and deliberately a separate function rather than a widened one:
 * that resolver answers about a `Membership` (a row this account already holds, which may be
 * expired, which may have lost its channel), this one answers about a `MembershipPackage` (a tier a
 * space is advertising). They share a rule, not a subject, and folding them together would mean one
 * function taking a union and re-deriving which half it was handed.
 *
 * ## The shared rule: Star is one POST, cash needs a card
 *
 * `price_id` selects the currency. Sent a `TVS` line the backend debits Star and answers done; sent a
 * `USD` line it answers a `{ action, action_data }` envelope, which `useJoinMembership` now hands to
 * the checkout (`features/payment`) rather than reporting as impossible. What is still missing for a
 * **cash-only** tier is the step that lets the reader choose the currency — legacy's own second
 * screen — so such a tier renders no button. That is a **price-selection** gap, not a payment one.
 *
 * The card path itself is live: a `USD` price id produces an action, and the hook hands it to
 * `usePayment().checkout({ kind: 'handoff', … })`. What this resolver would need is a currency the
 * caller chose; sending `USD` by default would silently change what a Star-priced tier charges.
 *
 * ## `null` means "no button", and it fails closed
 *
 * A tier with no id, or no positive `TVS` line, produces nothing. The alternative is a priced button
 * that 400s, which on a screen about money is worse than a space that appears to offer no membership.
 */
export interface JoinOffer {
    packageId: string
    /** The tier's name, for the dialog's title. `null` when the backend sent none. */
    name: string | null
    /** The creator's pitch for the tier. `null` when they wrote none. */
    description: string | null
    /** The `TVS` price line's id — what the backend charges against. */
    priceId: string
    /** Star to be deducted. Shown in the confirm, and what `useRequireStars` gates on. */
    stars: number
    /** The tier's cash price. `null` when the creator priced it in Star alone. */
    usd: number | null
    /**
     * The `USD` price line's id — what `subscribe/` is sent to start a **card** membership.
     *
     * It was deliberately not resolved for a while: a `USD` price id makes `subscribe/` answer a
     * Stripe `clientSecret`, and until `features/payment` shipped its card panel there was nothing
     * that could finish one. That is no longer true (`docs/PAYMENT.md` §8, passes 4–5), so the id is
     * read and the cash press hands the action over.
     *
     * `null` and `usd` do not always agree: a price line can carry an amount and no id. The amount
     * is enough to *show* a figure, the id is what is needed to *charge* — so they are separate
     * fields rather than one nullable pair.
     */
    cashPriceId: string | null
}

/**
 * The Star join available for this tier, or `null`.
 *
 * The currency is selected by **matching** `amount_currency`, never by position: the order of
 * `prices` is not guaranteed and legacy's `findIndex` over that field is the only thing that has
 * ever picked these apart (see **B44**).
 */
export function joinOffer(pkg: MembershipPackage | null | undefined): JoinOffer | null {
    const packageId = pkg?.id ?? ''
    if (!packageId) return null

    const star = pkg?.prices?.find(price => price.amount_currency === 'TVS')
    if (!star?.id || !Number.isFinite(star.amount) || star.amount <= 0) return null

    const cash = pkg?.prices?.find(price => price.amount_currency === 'USD')
    const usd =
        Number.isFinite(cash?.amount) && (cash?.amount ?? 0) > 0 ? (cash?.amount ?? null) : null

    return {
        packageId,
        name: pkg?.name ?? null,
        description: pkg?.description ?? null,
        priceId: star.id,
        stars: star.amount,
        usd,
        cashPriceId: usd !== null ? (cash?.id ?? null) : null,
    }
}

/**
 * Whether the tier also carries a cash price.
 *
 * Not used to gate anything today — the button is decided by `joinOffer` alone. It exists so the
 * dialog can say *why* it is offering only Star on a tier that advertises both, which is a different
 * sentence from a tier that is Star-only, and so the cash branch has an obvious place to hook onto.
 */
export function hasCashPrice(pkg: MembershipPackage | null | undefined): boolean {
    return Boolean(
        pkg?.prices?.some(
            price => price.amount_currency === 'USD' && Number.isFinite(price.amount),
        ),
    )
}

/**
 * The tier a space's action row offers.
 *
 * Legacy reads `subscriptionPackages[0]` and ignores the rest, so this does too — but it picks the
 * **first joinable** one rather than the literal first, which is the same intent expressed without
 * the failure mode: a space whose first tier is cash-only shows no button under legacy's rule while
 * a perfectly buyable second tier sits behind it.
 */
export function firstJoinable(packages: readonly MembershipPackage[]): JoinOffer | null {
    for (const pkg of packages) {
        const offer = joinOffer(pkg)
        if (offer) return offer
    }
    return null
}
