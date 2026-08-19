'use client'

import { useAuth } from '@features/auth'
import type { Channel } from '../api/types'
import type { ChannelOwnership } from '../lib/channel-flags'
import { useMyChannel } from '../providers/my-channel-provider'

/**
 * Whether the channel on screen belongs to the person looking at it.
 *
 * **A tri-state, never a boolean.** `'unknown'` is not a rounding error to default away — it is the
 * state the action row must render a fixed-height placeholder for. Collapsing it into `'viewer'` makes
 * an owner see "Follow · Message" for a frame and then watch it become "Custom profile"; collapsing it
 * into `'owner'` shows a stranger the owner's controls.
 *
 * ## Two tiers now, not three
 *
 * This used to gate an on-demand `my-channel` query behind an `enabled` flag so that a match on
 * `owner_id` could avoid the request. That bookkeeping is gone: `MyChannelProvider` already holds the
 * account's own channel for the whole app, so the slug comparison is free and there is no request to
 * avoid.
 *
 * 1. **Session not resolved yet → `'unknown'`.** See below; this is the tier that was missing.
 * 2. **Not signed in, anonymous, or no channel loaded → `'viewer'`.** Covers every crawler and every
 *    logged-out visit, which is most traffic, at zero cost.
 * 3. **Compare `owner_id` against `/me`, then `slug` against the account's own channel.** Either match
 *    means owner. Two comparisons rather than one because they fail differently: `owner_id` is
 *    synchronous and available on the public payload but depends on the two ids sharing an identifier
 *    space (B11, unconfirmed); the slug comparison is legacy's rule and always works once the provider
 *    has resolved. Whichever answers first is right.
 *
 * ## `isBootstrapping`, and the bug that was here
 *
 * This file used to open with `if (!channel || !isAuthenticated) return 'viewer'`, and the doc above
 * it claimed "the server always renders `'unknown'`". Both cannot be true, and the code was the one
 * that was wrong: **`isAuthenticated` is false for everybody during the session bootstrap**, owner
 * included, because it is derived from a `/me` that has not landed. So every load of a creator's own
 * space rendered "Follow" first and swapped it for "Custom profile" a beat later — the exact flash the
 * tri-state exists to prevent, reported as *"mỗi lần reload lại hiện btn follow trước"*.
 *
 * "Not signed in" and "not yet known whether signed in" are different answers and only one of them is
 * `'viewer'`. `isBootstrapping` is precisely the second: `true` from the store's initial state until
 * `AuthProvider` has either refreshed an existing token or minted an anonymous session.
 *
 * The cost is that a logged-out visitor also waits for bootstrap before their Follow button appears,
 * rather than getting it in the server HTML. That is the honest price: the server cannot know who is
 * asking, so anything it renders in that slot is a guess, and a guess that is wrong for the owner is
 * worse than a placeholder that is right for everyone. What makes it affordable is that the
 * placeholder is fixed-height and now *looks* like it is loading — see `channel-view.tsx`.
 */
export function useChannelOwnership(channel: Channel | null | undefined): ChannelOwnership {
    const { currentUser, isAuthenticated, isBootstrapping } = useAuth()
    const { myChannel, isLoading } = useMyChannel()

    if (!channel) return 'viewer'

    // Before `!isAuthenticated`, never after it — that ordering is the whole fix.
    if (isBootstrapping) return 'unknown'

    // `isAuthenticated` already excludes anonymous sessions, in this app and in legacy.
    if (!isAuthenticated) return 'viewer'

    // `AccountUser.id` is `string | number` and the DTO normalises `owner_id` to a string, so compare
    // as strings rather than trusting `==`.
    const userId = currentUser?.id
    if (userId != null && String(userId) === channel.owner_id) return 'owner'

    if (myChannel) return myChannel.slug === channel.slug ? 'owner' : 'viewer'
    // No channel of their own means they cannot be this one's owner.
    if (!isLoading) return 'viewer'
    return 'unknown'
}
