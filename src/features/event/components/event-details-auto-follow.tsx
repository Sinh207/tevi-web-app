'use client'

import { ChannelAutoFollow, useChannel } from '@features/channel'

/**
 * The auto-follow bar on **Live details** — legacy's `details/index.js` mounts `AutoFollowChannel`
 * under the three cards, the same component the space page uses, at the page's foot.
 *
 * Its own component because it needs the **space** (`useChannel`) for viewer-relative follow
 * state, and `EventScreen` should not pay that request for the host's report or a wall. It waits
 * for `isViewerKnown`, as the space page does: the seeded body says `is_followed: false` for
 * everybody, and a prompt that paints and then vanishes for a follower is the bug that rule fixed.
 */
export function EventDetailsAutoFollow({ slug }: { slug: string | null }) {
    const { channel, isViewerKnown } = useChannel(slug ?? '')
    if (!channel || !isViewerKnown) return null
    return <ChannelAutoFollow channel={channel} />
}
