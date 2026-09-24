'use client'

import { useAuth } from '@features/auth'
import { useMyChannel } from '@features/channel'
import type { EventDetail } from '../api/types'

/**
 * Is the person looking at this event the one who **hosts** it?
 *
 * The whole page turns on this: a host gets the revenue report, everybody else gets the viewer page.
 * Legacy branches on it too (`myChannel?.id && myChannel.id === event?.channel?.id`), and both
 * halves of that guard are load-bearing — its own comment records what happened without the first
 * one: *"comparing two undefined values used to come out true, which showed the creator dashboard
 * (revenue, analytics) to a visitor whose channel had not loaded yet — including the server render."*
 *
 * ## A tri-state, never a boolean
 *
 * `'unknown'` is not a rounding error to default away. Collapsed into `'viewer'`, a host sees a
 * paywall for their own broadcast for a frame and then watches it become a revenue report — the
 * flash `useChannelOwnership` was rewritten to prevent. Collapsed into `'host'`, a stranger sees
 * revenue.
 *
 * The screen renders the **skeleton** on `'unknown'`, which is what it would have rendered anyway
 * while the event loads, so the tri-state costs nothing visible.
 *
 * ## One rule: **this account's own channel against the event's**
 *
 * `myChannel.id === event.channel.id`, which is legacy's rule verbatim, and both ids must exist —
 * that guard is the whole point. `MyChannelProvider` already holds the account's channel for the
 * whole app, so the comparison is free and there is no request to avoid.
 *
 * ## ⚠ There used to be a second rule in front of it, and it was invented
 *
 * `String(currentUser.id) === event.channel.owner_id` ran **first**, documented here as *"the fast
 * path, not a hope"* on the strength of B11. That was wrong twice:
 *
 * - **Legacy does not do this.** Its only `owner_id` read anywhere in the event container is
 *   `blockUser(channel?.owner_id)` — a different question entirely. Ownership is the id comparison
 *   above and nothing else.
 * - **The field was never verified on this payload.** B11 answers that `/me`'s `id` and
 *   `owner_id` share an identifier space on `v3/channel/channels/{slug}/` — the *profile* response.
 *   The nested `channel` on `v4/public/events/{code}/` is a projection, and nobody had checked
 *   whether it carries the field at all, let alone whether it means the same thing.
 *
 * The failure direction is what makes that unacceptable rather than merely untidy: a rule that
 * matches when it should not returns **`'host'`**, and a false host is a stranger reading somebody's
 * revenue. A gate that moves money fails closed, so the unverified rule is gone rather than demoted.
 *
 * It also bought nothing. The claim was that `owner_id` could answer without `useMyChannel` — but
 * the fallback needed that hook regardless, so the import and its bundle cost were never avoidable.
 *
 * ## The cost of the one rule, stated
 *
 * `useMyChannel` is the one thing in `features/event` that imports `@features/channel`'s main
 * barrel, which pulls that feature into this page's chunk. Accepted deliberately: the alternative is
 * an ownership rule that can be wrong, and the failure mode is a creator shown a paywall for their
 * own stream — or worse, in the other direction. If the bundle cost has to go, the fix is a narrow
 * barrel on the channel side, not a weaker rule here.
 *
 * There is no cycle: `features/channel` reads `@features/event/access`, which imports nothing.
 */
export type EventOwnership = 'host' | 'viewer' | 'unknown'

export function useEventOwnership(event: EventDetail | null | undefined): EventOwnership {
    const { isAuthenticated, isBootstrapping } = useAuth()
    const { myChannel, isLoading } = useMyChannel()

    // No event yet — the screen is showing a skeleton for its own reasons.
    if (!event?.channel) return 'unknown'

    // Before `!isAuthenticated`, never after it: `isAuthenticated` is false for *everybody* during
    // the bootstrap, host included, because it is derived from a `/me` that has not landed. That
    // ordering is the whole fix, and `useChannelOwnership` documents the report it came from.
    if (isBootstrapping) return 'unknown'

    // Already excludes anonymous sessions, in this app and in legacy.
    if (!isAuthenticated) return 'viewer'

    if (myChannel) {
        /*
         * **Both ids must exist**, and that is legacy's own first guard rather than defensiveness:
         * its comment records what happened without it — *"comparing two undefined values used to
         * come out true, which showed the creator dashboard (revenue, analytics) to a visitor whose
         * channel had not loaded yet"*.
         */
        return myChannel.id && event.channel.id && myChannel.id === event.channel.id
            ? 'host'
            : 'viewer'
    }

    // No channel of their own means they cannot host this one.
    if (!isLoading) return 'viewer'
    return 'unknown'
}
