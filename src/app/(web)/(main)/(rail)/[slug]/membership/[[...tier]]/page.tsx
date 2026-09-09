import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { ChannelPageBody, channelPageMetadata } from '../../channel-page'

/**
 * `/@{slug}/membership` and `/@{slug}/membership/{id}` — the space, with the join dialog on top.
 *
 * Legacy's URL is the second one (`middleware.js` matched `/{slug}/membership/{anything}`), so the
 * segment is an **optional catch-all**: the links in the wild carry a tier id, and the canonical
 * form this app treats as the address does not.
 *
 * ## The id is accepted and ignored, and that is not laziness
 *
 * `useJoinFlow` resolves **one** offer per space, so there is nothing for an id to select. Refusing
 * an unknown one would turn an old link into a 404 for no gain — and old links are exactly where
 * deleted tier ids live. The day a space sells several tiers, this is where preselecting one goes;
 * until then the id is legacy's word for "the membership", not a choice.
 *
 * **One** extra segment, though, and `notFound()` past that. Legacy minted exactly
 * `/membership/{id}`, so anything deeper is a URL that has never existed — and an optional
 * catch-all left unchecked is more permissive than `parseChannelIntent`, which stops at one id.
 * The mismatch is the bug that would ship: `/@ada/membership/1/2` would render the space under a
 * "Become a member of Ada" share card with no dialog behind it and no way to tell why.
 *
 * **The dialog is not opened from here.** `BecomeAMemberButton` reads the intent off the URL and
 * owns the flow — including the already-a-member branch, which opens the membership's detail rather
 * than an offer to buy what the reader already has. A creator following their own link is sent to
 * `/monetization/membership` instead, from `ChannelOwnerActions`.
 */
type PageProps = { params: Promise<{ slug: string; tier?: string[] }> }

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
    const { slug, tier } = await params
    /*
     * Matches the body's `notFound()` below, and returns **nothing** rather than a `robots` — Next
     * emits its own `noindex` on a not-found render, and a second tag beside it is the hazard
     * `channel-page.tsx` documents twice. Measured: this branch shipped two of them.
     */
    if (tier && tier.length > 1) return {}
    return channelPageMetadata(slug, {
        suffix: '/membership',
        titleKey: 'membership_join_title',
    })
}

export default async function MembershipPage({ params }: PageProps) {
    const { slug, tier } = await params
    if (tier && tier.length > 1) notFound()
    /*
     * The canonical redirect drops the id: `/@ADA/membership/12` lands on `/@Ada/membership`. It
     * selects nothing, so carrying a stale tier id into a corrected URL would only put it back into
     * circulation.
     */
    return <ChannelPageBody raw={slug} suffix="/membership" />
}
