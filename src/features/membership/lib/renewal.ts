import type { Membership } from '../api/types'
import { type JoinOffer, joinOffer } from './join-offer'

/**
 * Whether an **expired** membership can be bought again, and with what.
 *
 * ## It resolves the tier, not the price — that is `joinOffer`'s job
 *
 * This used to resolve a Star price line itself and hand the detail dialog a one-currency offer, so
 * renewing spent Star and nothing else could be chosen. Legacy does not work that way: its list row
 * opens the **same** `BecomeAMember` + `Checkout` pair the space page opens, currency radio included
 * (`containers/myMembership/components/myMembershipItem/index.js` imports both). A reader whose card
 * paid for the membership the first time was being told, on the screen about that membership, that
 * only Star could pay for it again.
 *
 * So price resolution is delegated to `joinOffer` — one resolver, one set of rules about which price
 * line means what — and what is left here is the part that is genuinely about a *held* membership:
 * is it expired, and is its space still there.
 *
 * ## `null` means "no button", and it fails closed
 *
 * - **the row must be expired.** A live membership renews by *not* cancelling, and a
 *   cancelled-but-active one renews through `undo-cancel/` — a different, free operation that this
 *   resolver has nothing to do with.
 * - **`channel.slug`** — the endpoint is `channel/{slug}/packages/{id}/subscribe/`. A membership whose
 *   space is gone (`channel: null`, common on expired rows — see `normalizeMemberships`) has nowhere
 *   to subscribe *to*.
 * - **a joinable tier**, which is `joinOffer`'s answer: an id and a billable price line. Its `null`
 *   still covers the cash-only tier, because that resolver has not changed its own rule.
 *
 * Fail closed on all three: the alternative is a priced button that 400s, which on a screen about
 * money is worse than a screen that says the membership ended.
 */

export interface RenewalOffer {
    /** Channel slug, without a leading `@` — goes straight into the path. */
    slug: string
    /** The space's id, for the join flow's "am I already a member" question. `null` when absent. */
    channelId: string | null
    /** The creator's name, for the join dialog's title. `null` falls back to the slug. */
    name: string | null
    /** Badged onto the join dialog's illustration tile. */
    avatarUrl: string | null
    /** The tier and its prices — the same shape the space page's join button is given. */
    offer: JoinOffer
}

/**
 * The renewal available for this membership, or `null`.
 *
 * The tier comes off the membership's own `package`, which `membershipPackageSchema` keeps whole
 * (prices included) for exactly this: the row already carries what the reader would be buying, so
 * renewing needs no second request to the space's price list.
 */
export function renewalOffer(membership: Membership | null | undefined): RenewalOffer | null {
    if (membership?.status !== 'expired') return null

    const channel = membership.channel
    const slug = channel?.slug ?? ''
    if (!slug) return null

    const offer = joinOffer(membership.package)
    if (!offer) return null

    return {
        slug,
        channelId: channel?.id ?? null,
        name: channel?.name ?? null,
        avatarUrl: channel?.images?.thumb ?? null,
        offer,
    }
}
