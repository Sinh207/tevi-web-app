import { ChannelLiveEventScreen, parseChannelSlug } from '@features/channel'
import { getChannelForRequest } from '@features/channel/server'
import { getServerT } from '@shared/i18n/server'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

/**
 * `/@{slug}/event/{code}` — one of a space's live events.
 *
 * ## What this is and, more usefully, what it is not
 *
 * It is **not** the live player. This rewrite has no player yet, and nothing here pretends
 * otherwise: the page finds the event in the space's payload and tells the reader where it can
 * actually be watched — the app — with the branded QR and the store links.
 *
 * It exists now, ahead of the player, because three things already point at this URL and every one
 * of them was a **404**: the live card in the Posts tab, the Share row's copied link, and the QR
 * code that link is drawn into. A share link that 404s is worse than a share link that says "watch
 * this in the app", and the QR ends up on posters.
 *
 * ## The event comes from the channel, because there is no other door
 *
 * `v4/events/` answers for the bearer and takes no slug, so a visitor cannot fetch somebody else's
 * event by code. `channel.lives[]` carries the whole event DTO (B74a) and arrives with the space, so
 * the lookup is a `find` over data the page already had to fetch. The cost is real and worth stating:
 * only events **in that array** resolve. An ended stream, or one the payload does not list, is a 404
 * here even though it exists — which is honest for a page whose only content is "watch it live".
 */
export async function generateMetadata({
    params,
}: {
    params: Promise<{ slug: string; code: string }>
}): Promise<Metadata> {
    const { slug, code } = await params
    const t = await getServerT()
    const parsed = parseChannelSlug(slug)
    // A malformed handle is not a lookup — `parseChannelSlug` rejects anything not `@slug`.
    const { channel } = parsed ? await getChannelForRequest(parsed) : { channel: null }
    const event = channel?.lives.find(live => live.code === code)

    return {
        title: event?.title ?? t('channel_event_untitled'),
        /*
         * Never indexed. The page is a stand-in for a player that does not exist here, so letting a
         * crawler keep it would put "watch this in the app" in results for a stream that ended
         * hours ago. `channel/page.tsx` earns its index; this does not.
         */
        robots: { index: false, follow: true },
    }
}

export default async function ChannelEventPage({
    params,
}: {
    params: Promise<{ slug: string; code: string }>
}) {
    const { slug, code } = await params
    const parsed = parseChannelSlug(slug)
    if (!parsed) notFound()
    const { channel } = await getChannelForRequest(parsed)
    const event = channel?.lives.find(live => live.code === code)

    // No channel, no such event, or an event that is not on air: there is nothing this page can say.
    if (!channel || !event) notFound()

    return <ChannelLiveEventScreen channel={channel} event={event} />
}
