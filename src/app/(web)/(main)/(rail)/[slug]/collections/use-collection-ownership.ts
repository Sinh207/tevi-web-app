'use client'

import { useAuth } from '@features/auth'
import { useMyChannel } from '@features/channel'

/**
 * Whose collections these are — `owner`, `viewer`, or `unknown` while the reader's own channel is
 * still loading. The three collection surfaces under this route all need the same answer, and
 * `features/post` cannot compute it (`useMyChannel` is `features/channel`'s, which imports it).
 *
 * `myChannel` is `undefined` while unknown and `null` for an account without a channel, which is a
 * viewer everywhere. A failed read counts as a viewer: nothing the owner alone may do is offered,
 * and the public half of the contract still answers.
 */
export function useCollectionOwnership(slug: string) {
    const { isAuthenticated } = useAuth()
    const { myChannel, isError, isPremium } = useMyChannel()

    const ownership: 'owner' | 'viewer' | 'unknown' =
        isAuthenticated && myChannel === undefined && !isError
            ? 'unknown'
            : myChannel?.slug != null && myChannel.slug.toLowerCase() === slug.toLowerCase()
              ? 'owner'
              : 'viewer'

    return { ownership, channelId: myChannel?.id ?? null, isPremium }
}
