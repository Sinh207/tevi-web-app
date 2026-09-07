/**
 * What the reader just bought, according to the settle response's `type`.
 *
 * ## Why the wire strings live here and nowhere else
 *
 * `payment/v3/stripe/callback/` answers `{ type }` on success, and legacy switches on it in two
 * places (`dialogs/checkoutSuccess`, `dialogs/checkoutFailed`) with the strings inline in both. Same
 * rule as `features/permission/lib/capabilities.ts` and `my-membership/lib/payment-methods.ts`: the
 * spelling is declared once and every screen above it works in product terms.
 *
 * ## The three values legacy knows, and what it does with the rest
 *
 * | wire | here | what the success dialog does |
 * |---|---|---|
 * | `subscription` | `membership` | "You are now a member" — no further offer |
 * | `direct_donation`, `crowdfunding_donation` | `donation` | "Thank you" — no further offer |
 * | anything else | `stars` | "Order completed", **plus** a way to buy more |
 *
 * The default is `stars` because that is legacy's own default and because a Star top-up is the common
 * purchase — legacy never enumerates a Star `type` at all, it simply falls through. The cost of the
 * default being wrong is a "Get more Star" button on a purchase that was not Star: a mild wrong-foot,
 * not a money error, and **B69** is the question that closes it. The alternative — treating unknown as
 * its own kind — would drop the offer from the one flow that most needs it, on a guess about a string
 * nobody has enumerated either way.
 */
export type PurchaseKind = 'membership' | 'donation' | 'stars'

/** Legacy's own strings, lower-cased on the way in: the wire's case has never been confirmed. */
const KINDS: Record<string, PurchaseKind> = {
    subscription: 'membership',
    direct_donation: 'donation',
    crowdfunding_donation: 'donation',
}

export function purchaseKind(type: string | null | undefined): PurchaseKind {
    if (!type) return 'stars'
    return KINDS[type.trim().toLowerCase()] ?? 'stars'
}

/**
 * Whether the success dialog offers to buy more.
 *
 * Only after a Star purchase. Offering it after a membership or a donation is offering to do the thing
 * they just did — legacy hides it for exactly those two, and it is the right call: "become a member
 * again" is not a next step.
 */
export function offersMore(kind: PurchaseKind): boolean {
    return kind === 'stars'
}
