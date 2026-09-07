import type { MembershipPackage, MembershipPrice } from '../api/types'
import { membershipChargedTotal, membershipFee } from './membership-fee'

/**
 * The **card** join available for a tier, or `null` — the USD counterpart of `joinOffer`.
 *
 * ## Why this is a second resolver and not a flag on the first
 *
 * `joinOffer` answers "can this tier be joined with Star", and it fails closed on a tier that has no
 * `TVS` line. That is the right answer for the space page's one button, and the wrong one here: the
 * `/app/[channelSlug]/membership/[packageId]` webview is opened by the native app **to take a card**,
 * so a Star-only tier is what should produce nothing, and a cash-only tier is the ordinary case.
 *
 * Two resolvers over one payload, each fail-closed on its own currency, is what keeps
 * `docs/PAYMENT.md` §8's warning true: *sending the `USD` row as the default would silently change
 * the amount a Star-priced tier collects.* Neither function can pick a currency the caller did not
 * ask for, because neither knows the other exists.
 *
 * ## The currency is matched, never positional
 *
 * `prices` has no guaranteed order. Legacy's own webview does
 * `prices.findIndex(p => p.amount_currency === 'USD')` and then reads `prices[index]` — and because
 * `?.findIndex` on an absent array yields `undefined` rather than `-1`, its `index !== -1` guard
 * passes and the next line indexes `undefined`. That is a TypeError on a checkout screen, reachable
 * from any package payload that arrives without a `prices` array. Here the row is `find`-ed and its
 * absence is a `null` return.
 *
 * ## The fee is computed here so the button and the summary cannot disagree
 *
 * `usd` is what the creator set, `total` is what the card is charged, and `fee` is the difference —
 * all three from `membershipFee` (5.9% + $0.30 grossed up, pinned per cent by its own test, **B71**).
 * Legacy recomputes the same expression inline in `useMembershipDetails` with `feeUSD > 0` guarding
 * the total, so a $0 fee prints a **$0 total** underneath a real price.
 */
export interface CashOffer {
    packageId: string
    /** The tier's name, for the order line. `null` when the backend sent none. */
    name: string | null
    /** The creator's pitch for the tier. `null` when they wrote none. */
    description: string | null
    /** The `USD` price line's id — what identifies the line the host is asked to charge. */
    priceId: string
    /**
     * The whole price row, because the **native host wants the object, not the id**.
     * `TeviJS.membershipCheckout({ packageId, priceInfo })` is sent `packageInfo.prices[…]` verbatim
     * by legacy and the host builds its request from it, so sending a reconstructed `{ id }` would be
     * a different message. Carried here so exactly one thing decides which row that is.
     *
     * ⚠ It is the **parsed** row: `amount` is a number where the wire sends `"5.00"`, and
     * `amount_currency` is upper-cased. See **B85**.
     */
    price: MembershipPrice
    /** The tier price, as the creator set it. Always `> 0`. */
    usd: number
    /** The processor's cut, grossed up so the creator receives `usd`. `0` is legitimate. */
    fee: number
    /** What the card is actually charged: `usd + fee`. */
    total: number
}

/**
 * The card join for this tier, or `null` when it cannot be charged.
 *
 * `null` on: no package id, no `USD` price line, a line with no id, or a non-positive amount. A price
 * id is what the backend charges against, so an amount without one can be *shown* but not *sold* —
 * and a checkout screen that shows a figure it cannot collect is worse than one that says the tier is
 * unavailable. Same call, and the same reasoning, as `joinOffer`'s `cashPriceId`.
 */
export function cashOffer(pkg: MembershipPackage | null | undefined): CashOffer | null {
    const packageId = pkg?.id ?? ''
    if (!packageId) return null

    const cash = pkg?.prices?.find(price => price.amount_currency === 'USD')
    if (!cash?.id || !Number.isFinite(cash.amount) || cash.amount <= 0) return null

    return {
        packageId,
        name: pkg?.name ?? null,
        description: pkg?.description ?? null,
        priceId: cash.id,
        price: cash,
        usd: cash.amount,
        fee: membershipFee(cash.amount),
        total: membershipChargedTotal(cash.amount),
    }
}
