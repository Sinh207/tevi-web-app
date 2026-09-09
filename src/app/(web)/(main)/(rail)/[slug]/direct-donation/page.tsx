import type { Metadata } from 'next'
import { ChannelPageBody, channelPageMetadata } from '../channel-page'

/**
 * `/@{slug}/direct-donation` — the space, with the creator's donation dialog opening on top.
 *
 * Legacy's URL, unchanged (`middleware.js` matched exactly this path), so every link already shared
 * resolves straight through on a same-origin cutover. What changed is what happens to it: legacy
 * bounced it to `/@{slug}?action=direct_donation`, which meant a share card describing the space
 * rather than the offer and a redirect in front of every visit. This is the same page at its own
 * address — `channel-page.tsx`'s header has the full reasoning.
 *
 * **The dialog is not opened from here.** `DonateButton` reads the intent off the URL
 * (`parseChannelIntent`, `useUrlIntent`) and owns the flow; this route renders the space and nothing
 * else knows a donation exists. Which also means the honest edge is inherited rather than
 * reimplemented: a space that takes no donations, prices its offer in cash only, leads with a mini
 * app, or is protected and unfollowed renders the space and opens nothing — the same set of
 * conditions `ChannelViewerActions` already decides.
 *
 * A creator following their own link is sent to `/monetization` instead, from `ChannelOwnerActions`.
 */
type PageProps = { params: Promise<{ slug: string }> }

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
    const { slug } = await params
    return channelPageMetadata(slug, {
        suffix: '/direct-donation',
        titleKey: 'donation_support_title',
    })
}

export default async function DirectDonationPage({ params }: PageProps) {
    const { slug } = await params
    return <ChannelPageBody raw={slug} suffix="/direct-donation" />
}
