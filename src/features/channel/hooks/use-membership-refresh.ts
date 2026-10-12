'use client'

import { useAuth } from '@features/auth'
import { useQueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'
import { channelKeys, forgetChannelViewerCache } from '../api/channel-api'

/**
 * Re-read what a membership unlocks on the space page, once the reader has just joined.
 *
 * `features/membership` refreshes what *it* owns — the reader's subscriptions and their balance — and
 * nothing of this page: the posts behind the members-only lock, the member count, the space itself.
 * So a reader sent here from a locked post or a DM's member wall paid, saw "Activated membership",
 * and was still shown the lock until a reload. Membership cannot do it for us — it would have to
 * import this feature, which already imports it — so it reports the moment (`onJoined`) and the
 * page that owns the data re-reads it.
 *
 * - **The space and its stats** — `member_count` moved, and the body is viewer-relative.
 *
 * **Not the posts.** Whatever the join unlocked is re-read by `features/post`'s `PostCacheSync`,
 * which hears `membership:joined` from the join itself — so it also covers the four other surfaces
 * that sell a membership and never mount this hook. The thread pages are deliberately not refetched
 * either: a list endpoint can answer with the locked row still, and a refetch landing after the
 * listener's patch would put the lock back.
 *
 * The validators go first and are awaited: see `forgetChannelViewerCache`.
 */
export function useMembershipRefresh(slug: string) {
    const queryClient = useQueryClient()
    const { activeId } = useAuth()

    return useCallback(async () => {
        await forgetChannelViewerCache(slug, activeId)
        queryClient.invalidateQueries({ queryKey: channelKeys.detail(slug, activeId) })
        queryClient.invalidateQueries({ queryKey: channelKeys.stats(slug, activeId) })
    }, [queryClient, slug, activeId])
}
