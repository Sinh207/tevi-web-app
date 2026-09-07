/**
 * The feature's cache namespace — one object across four models.
 *
 * Keys normally live next to their model (`donationKeys`, `membershipKeys`), and four models would
 * mean four objects. They are one here for a reason that is specific to money: after a payment
 * settles, *everything* this feature holds is suspect at once — the card list may have gained the
 * card that was just saved, the gateway list may have re-priced, and the packages may have changed.
 * `invalidateQueries({ queryKey: paymentKeys.all })` has to be one call, and a shared prefix is what
 * makes it one.
 *
 * ## What is scoped to an account, and what is not
 *
 * Only the card list. It is the only per-account payload here: the Stripe publishable key, the
 * gateway list and the Star packages are **platform** configuration, identical for every reader, and
 * scoping them would refetch all three on every account switch for no change in the answer.
 *
 * The card list, by contrast, **must** be scoped, and not merely to avoid a stale render: the ETag
 * store is namespaced per account (`shared/lib/api/interceptors/etag.ts`), so a shared key would let
 * one account replay another's cached body — somebody else's saved cards under this reader's name.
 * Same warning as `membershipKeys` and `starLedgerKeys`, and it matters more here.
 */
export const paymentKeys = {
    all: ['payment'] as const,
    /** `payment/v3/stripe/config/` — the publishable key. Platform-wide. */
    stripeConfig: () => [...paymentKeys.all, 'stripe-config'] as const,
    /** This account's saved payment methods. Account-scoped — see above. */
    cards: (accountId: string | null) =>
        [...paymentKeys.all, 'cards', accountId ?? 'anon'] as const,
    /**
     * Ways to pay, for a country. `'auto'` is "let the backend geolocate", which is what legacy does
     * (it calls the endpoint with no country at all) — kept in the key so an explicit choice and the
     * automatic one cannot share a cache entry.
     */
    gateways: (country?: string | null) =>
        [...paymentKeys.all, 'gateways', country?.trim().toUpperCase() || 'auto'] as const,
    /** `stars/v3/conversion-packages/`. Platform-wide, and effectively static. */
    starPackages: () => [...paymentKeys.all, 'star-packages'] as const,
    /**
     * `GET checkout/v3/checkout/` — this reader's own top-ups. Account-scoped for the same reason
     * the card list is, and it is the stronger case of the two: the ETag store is namespaced per
     * account, so a shared key would let one account replay another's cached body — somebody else's
     * purchase history, with amounts, under this reader's name.
     */
    transactions: (accountId: string | null) =>
        [...paymentKeys.all, 'transactions', accountId ?? 'anon'] as const,
}
