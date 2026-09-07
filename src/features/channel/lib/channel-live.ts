import type { ChannelEvent } from '../api/events-api'
import type { Channel } from '../api/types'

type WithLives = Pick<Channel, 'lives'> | null | undefined

/**
 * The space's events that are **on air right now**.
 *
 * `channel.lives` is every event the space has in play, each with its own `status`; "live" is the
 * subset saying `LIVE`. `channelEventSchema` upper-cases `status` on the way in, so nothing here
 * has to know that the wire is inconsistent about it.
 *
 * This array is the only live signal a **visitor** gets: `v4/events/` answers for the bearer and
 * takes no slug, so there is no request that fetches somebody else's events.
 */
export function liveEvents(channel: WithLives): ChannelEvent[] {
    return (channel?.lives ?? []).filter(event => event.status === 'LIVE')
}

/**
 * Is this space **broadcasting right now**?
 *
 * ## Legacy's version answers **true** for a space with no events at all
 *
 * ```js
 * const index = channel?.lives?.findIndex(item => item.status?.toUpperCase() === 'LIVE')
 * return index !== -1
 * ```
 *
 * With no `lives` array the optional chain yields `undefined`, and `undefined !== -1` is `true`.
 * So the red ring and the Live flag are drawn over the avatar of a space that has never streamed,
 * whenever the payload omits the field. `channelSchema` catches `lives` to `[]`, so this port cannot
 * reproduce it even by copying the expression — but it is written as a real predicate rather than an
 * index comparison so nobody restores the shape later and reintroduces it through a different door.
 */
export function isChannelLive(channel: WithLives): boolean {
    return liveEvents(channel).length > 0
}
